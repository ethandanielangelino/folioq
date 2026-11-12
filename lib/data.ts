// Server-side loaders that turn database rows plus live quotes into the
// shapes the pages render. Shared by the owner's dashboard and shared links.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getProfile, getQuotes, type CompanyProfile, type Quote } from '@/lib/finnhub'
import { marketDate } from '@/lib/format'
import {
  buildHistory,
  computeTotals,
  valueHoldings,
  type HistoryPoint,
  type HoldingInput,
  type PortfolioTotals,
  type ValuedHolding,
} from '@/lib/portfolio'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  HoldingRow,
  MessageRow,
  PortfolioRow,
  PriceRow,
  Thesis,
  ThesisRow,
} from '@/lib/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function toHoldingInput(row: HoldingRow): HoldingInput {
  return {
    id: row.id,
    ticker: row.ticker,
    // Postgres numerics can arrive as strings depending on the driver.
    quantity: Number(row.quantity),
    costBasis: row.cost_basis === null ? null : Number(row.cost_basis),
    openedAt: String(row.opened_at).slice(0, 10),
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function toThesis(row: ThesisRow): Thesis {
  return {
    id: row.id,
    holdingId: row.holding_id,
    version: Number(row.version),
    claim: (row.claim ?? '').trim(),
    assumptions: toStringList(row.assumptions),
    risks: toStringList(row.risks),
    authorEdited: Boolean(row.author_edited),
    createdAt: row.created_at,
  }
}

export interface Holding extends ValuedHolding {
  name: string | null
  industry: string | null
  /** Latest version, or null when no thesis has been written. */
  thesis: Thesis | null
  /** Earlier versions, newest first. */
  thesisHistory: Thesis[]
}

export interface SectorSlice {
  label: string
  marketValue: number
  weight: number
}

export interface PortfolioView {
  portfolio: PortfolioRow
  holdings: Holding[]
  sectors: SectorSlice[]
  totals: PortfolioTotals
  /** Oldest first; ends with today's live value when every holding has a quote. */
  history: HistoryPoint[]
  /** Latest quotes for the holdings, for saving today's prices. */
  quotes: Record<string, Quote | null>
  /** False until supabase/setup.sql has added portfolios.share_token. */
  sharingAvailable: boolean
  /** When the quotes above were fetched (ms since epoch). */
  fetchedAt: number
}

export interface PortfolioCard {
  portfolio: PortfolioRow
  holdingCount: number
  thesisCount: number
  /** Tickers held with no thesis written. */
  missing: string[]
  /** Tickers whose current thesis is an AI draft saved without changes. */
  drafts: string[]
  totals: PortfolioTotals
  /** Recent value history for the sparkline, oldest first. */
  history: HistoryPoint[]
}

const UNCLASSIFIED = 'Funds and other'
const SPARKLINE_DAYS = 90

async function getProfiles(tickers: string[]): Promise<Record<string, CompanyProfile | null>> {
  const profiles: Record<string, CompanyProfile | null> = {}
  const concurrency = 6
  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency)
    const results = await Promise.all(batch.map((t) => getProfile(t)))
    batch.forEach((ticker, index) => {
      profiles[ticker] = results[index]
    })
  }
  return profiles
}

function groupBySector(holdings: Holding[]): SectorSlice[] {
  const byLabel = new Map<string, number>()
  for (const h of holdings) {
    const label = h.industry ?? UNCLASSIFIED
    byLabel.set(label, (byLabel.get(label) ?? 0) + h.marketValue)
  }
  const total = holdings.reduce((sum, h) => sum + h.marketValue, 0)
  return [...byLabel.entries()]
    .map(([label, marketValue]) => ({
      label,
      marketValue,
      weight: total > 0 ? marketValue / total : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
}

export async function buildPortfolioView(
  portfolio: PortfolioRow,
  holdingRows: HoldingRow[],
  thesisRows: ThesisRow[],
  priceRows: PriceRow[]
): Promise<PortfolioView> {
  const inputs = holdingRows.map(toHoldingInput)
  const tickers = [...new Set(inputs.map((h) => h.ticker))]

  const [quotes, profiles] = await Promise.all([getQuotes(tickers), getProfiles(tickers)])

  const thesesByHolding = new Map<string, Thesis[]>()
  for (const row of thesisRows) {
    const list = thesesByHolding.get(row.holding_id) ?? []
    list.push(toThesis(row))
    thesesByHolding.set(row.holding_id, list)
  }
  for (const list of thesesByHolding.values()) {
    list.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))
  }

  const valued = valueHoldings(inputs, quotes)
  const holdings: Holding[] = valued.map((h) => {
    const versions = thesesByHolding.get(h.id) ?? []
    return {
      ...h,
      name: profiles[h.ticker]?.name ?? null,
      industry: profiles[h.ticker]?.industry ?? null,
      thesis: versions[0] ?? null,
      thesisHistory: versions.slice(1),
    }
  })
  const totals = computeTotals(valued)

  // Stored closes for past days, then today's live value on the end.
  const today = marketDate()
  const history = buildHistory(
    inputs,
    priceRows
      .map((p) => ({
        ticker: p.ticker,
        date: String(p.price_date).slice(0, 10),
        close: Number(p.close),
      }))
      .filter((p) => p.date < today)
  )
  if (holdings.length > 0 && totals.unpriced.length === 0) {
    history.push({ date: today, marketValue: totals.marketValue, costBasis: totals.costBasis })
  }

  return {
    portfolio,
    holdings,
    sectors: groupBySector(holdings),
    totals,
    history,
    quotes,
    sharingAvailable: 'share_token' in portfolio,
    fetchedAt: Date.now(),
  }
}

async function loadView(client: SupabaseClient, portfolio: PortfolioRow): Promise<PortfolioView> {
  const holdings = await client.from('holdings').select('*').eq('portfolio_id', portfolio.id)
  if (holdings.error) throw new Error(holdings.error.message)
  const holdingRows = (holdings.data ?? []) as HoldingRow[]

  if (holdingRows.length === 0) return buildPortfolioView(portfolio, [], [], [])

  const ids = holdingRows.map((h) => h.id)
  const tickers = [...new Set(holdingRows.map((h) => h.ticker))]
  const earliest = holdingRows.map((h) => String(h.opened_at).slice(0, 10)).sort()[0]

  const [theses, prices] = await Promise.all([
    client.from('theses').select('*').in('holding_id', ids),
    client
      .from('prices')
      .select('*')
      .in('ticker', tickers)
      .gte('price_date', earliest)
      .order('price_date', { ascending: true }),
  ])
  if (theses.error) throw new Error(theses.error.message)
  // Price history is a nice-to-have: without it the chart just starts today.
  const priceRows = prices.error ? [] : ((prices.data ?? []) as PriceRow[])

  return buildPortfolioView(
    portfolio,
    holdingRows,
    (theses.data ?? []) as ThesisRow[],
    priceRows
  )
}

/**
 * A portfolio the signed-in user may open: their own, or one shared with
 * them that they have accepted. Row level security decides which rows come
 * back; `getPortfolioRole` then says what they may do with it.
 */
export async function getOwnedPortfolioView(
  supabase: SupabaseClient,
  id: string
): Promise<PortfolioView | null> {
  if (!isUuid(id)) return null

  const { data, error } = await supabase.from('portfolios').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  return loadView(supabase, data as PortfolioRow)
}

/**
 * What this user may do with a portfolio they can see: 'owner', 'editor',
 * 'viewer', or null for none of those.
 */
export async function getPortfolioRole(
  supabase: SupabaseClient,
  portfolio: Pick<PortfolioRow, 'id' | 'user_id'>,
  userId: string
): Promise<'owner' | 'editor' | 'viewer' | null> {
  if (portfolio.user_id === userId) return 'owner'

  const { data } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolio.id)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  const role = (data as { role?: string } | null)?.role
  return role === 'editor' ? 'editor' : role === 'viewer' ? 'viewer' : null
}

/** A portfolio reached through its share link. Null if the link is off or wrong. */
export async function getSharedPortfolioView(token: string): Promise<PortfolioView | null> {
  if (!isUuid(token)) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('portfolios')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()
  // 42703: the share_token column hasn't been added yet, so no link can be valid.
  if (error) {
    if (error.code === '42703') return null
    throw new Error(error.message)
  }
  if (!data) return null

  return loadView(admin, data as PortfolioRow)
}

/** The portfolio's conversation with the assistant, oldest first. */
export async function getMessages(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as MessageRow[]
}

/** Names of the portfolios this user owns, oldest first, for navigation. */
export async function getPortfolioNames(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: true })
  return (data ?? []) as { id: string; name: string }[]
}

/**
 * Headline numbers for a set of portfolios: either everything `ownerId` owns,
 * or the specific `ids` given (used for portfolios shared with the user).
 * Shared portfolios are visible to the same queries, so the two are always
 * asked for separately.
 */
export async function getPortfolioCards(
  supabase: SupabaseClient,
  which: { ownerId: string } | { ids: string[] }
): Promise<PortfolioCard[]> {
  if ('ids' in which && which.ids.length === 0) return []

  const wanted = supabase.from('portfolios').select('*').order('created_at', { ascending: true })
  const [portfolios, holdings, theses] = await Promise.all([
    'ownerId' in which ? wanted.eq('user_id', which.ownerId) : wanted.in('id', which.ids),
    supabase.from('holdings').select('*'),
    supabase.from('theses').select('holding_id, version, author_edited'),
  ])
  if (portfolios.error) throw new Error(portfolios.error.message)
  if (holdings.error) throw new Error(holdings.error.message)

  const rows = (portfolios.data ?? []) as PortfolioRow[]
  const included = new Set(rows.map((row) => row.id))
  const holdingRows = ((holdings.data ?? []) as HoldingRow[]).filter((h) =>
    included.has(h.portfolio_id)
  )
  // The newest version of each holding's thesis, and whether its owner has edited it.
  const latest = new Map<string, { version: number; edited: boolean }>()
  for (const t of (theses.data ?? []) as Pick<ThesisRow, 'holding_id' | 'version' | 'author_edited'>[]) {
    const seen = latest.get(t.holding_id)
    if (!seen || t.version > seen.version) {
      latest.set(t.holding_id, { version: t.version, edited: t.author_edited !== false })
    }
  }

  const byPortfolio = new Map<string, HoldingRow[]>()
  for (const row of holdingRows) {
    const list = byPortfolio.get(row.portfolio_id) ?? []
    list.push(row)
    byPortfolio.set(row.portfolio_id, list)
  }

  const tickers = [...new Set(holdingRows.map((h) => h.ticker))]
  const today = marketDate()
  const since = new Date(Date.now() - SPARKLINE_DAYS * 86_400_000).toISOString().slice(0, 10)

  const [quotes, prices] = await Promise.all([
    getQuotes(tickers),
    tickers.length > 0
      ? supabase.from('prices').select('*').in('ticker', tickers).gte('price_date', since)
      : Promise.resolve({ data: [] as PriceRow[], error: null }),
  ])
  // The sparkline is decoration: if prices can't be read, cards simply go without.
  const closes = (prices.error ? [] : ((prices.data ?? []) as PriceRow[]))
    .map((p) => ({
      ticker: p.ticker,
      date: String(p.price_date).slice(0, 10),
      close: Number(p.close),
    }))
    .filter((p) => p.date < today)

  return rows.map((portfolio) => {
    const inputs = (byPortfolio.get(portfolio.id) ?? []).map(toHoldingInput)
    const valued = valueHoldings(inputs, quotes)
    const totals = computeTotals(valued)

    const history = buildHistory(inputs, closes)
    if (valued.length > 0 && totals.unpriced.length === 0) {
      history.push({ date: today, marketValue: totals.marketValue, costBasis: totals.costBasis })
    }

    return {
      portfolio,
      holdingCount: valued.length,
      thesisCount: valued.filter((h) => latest.has(h.id)).length,
      missing: valued.filter((h) => !latest.has(h.id)).map((h) => h.ticker),
      drafts: valued.filter((h) => latest.get(h.id)?.edited === false).map((h) => h.ticker),
      totals,
      history,
    }
  })
}

/**
 * Saves the latest price of each ticker into `prices`, filed under the market
 * day of its last trade. The nightly job does this for every held ticker;
 * portfolio pages call it too so history builds up without the job.
 * Needs the service role, because `prices` is shared and not writable by users.
 */
export async function savePrices(quotes: Record<string, Quote | null>): Promise<number> {
  const rows = Object.entries(quotes)
    .filter((entry): entry is [string, Quote] => entry[1] !== null && entry[1].timestamp > 0)
    .map(([ticker, quote]) => ({
      ticker,
      price_date: marketDate(new Date(quote.timestamp * 1000)),
      close: quote.price,
    }))
  if (rows.length === 0) return 0

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return 0
  }
  const { error } = await admin.from('prices').upsert(rows, { onConflict: 'ticker,price_date' })
  return error ? 0 : rows.length
}
