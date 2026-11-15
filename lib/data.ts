// Server-side loaders that turn database rows plus live quotes into the
// shapes the pages render. Shared by the owner's dashboard and shared links.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAssetQuotes, cryptoName, lastClosesBefore } from '@/lib/asset-prices'
import { withDirectQuotes } from '@/lib/direct-prices'
import { CURRENCIES } from '@/lib/currency'
import {
  METALS,
  groupLabel,
  kindOf,
  priceKey,
  toAssetClass,
  type AssetClass,
} from '@/lib/assets'
import { getProfile, type CompanyProfile, type Quote } from '@/lib/finnhub'
import { marketDate } from '@/lib/format'
import { getMoney } from '@/lib/money'
import type { PriceSource } from '@/lib/price-sources'
import { historyNotSetUp, positionOn, positionTimeline, toHistoryEntry, type HistoryEntry } from '@/lib/history'
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

type AssetInput = HoldingInput & { assetClass: AssetClass; key: string }

function toHoldingInput(row: HoldingRow): AssetInput {
  const assetClass = toAssetClass(row.asset_class)
  return {
    id: row.id,
    ticker: row.ticker,
    assetClass,
    key: priceKey(row.ticker, assetClass),
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
  /** What kind of holding it is. 'stock' for every holding before supabase/assets.sql. */
  assetClass: AssetClass
  /** Where its prices are kept: the ticker for listed holdings, prefixed for the rest. */
  key: string
  name: string | null
  industry: string | null
  /** Latest version, or null when no thesis has been written. */
  thesis: Thesis | null
  /** Earlier versions, newest first. */
  thesisHistory: Thesis[]
  /**
   * Where its price came from: the exchange and pair when it is quoted directly
   * in the display currency, otherwise a US-dollar source. Null when unpriced,
   * and for US dollars held as cash.
   */
  priceSource: PriceSource | null
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
  /** Value by kind of asset: Stocks, Bonds, Crypto, Cash and so on. */
  assetGroups: SectorSlice[]
  /** True when any holding is crypto, whose day change is over 24 hours. */
  hasCrypto: boolean
  totals: PortfolioTotals
  /** Oldest first; ends with today's live value when every holding has a quote. */
  history: HistoryPoint[]
  /** Latest US-dollar quotes for the holdings, for saving today's prices. */
  quotes: Record<string, Quote | null>
  /** The display currency the holdings were valued for (direct quotes depend on it). */
  pricedIn: string
  /** False until supabase/setup.sql has added portfolios.share_token. */
  sharingAvailable: boolean
  /** When the quotes above were fetched (ms since epoch). */
  fetchedAt: number
  /** Every recorded change to the holdings, for the History panels. */
  holdingHistory: PortfolioHistory
  /** True when the value chart counts what was held each day, from the history. */
  historyReplayed: boolean
}

export interface PortfolioCard {
  portfolio: PortfolioRow
  holdingCount: number
  thesisCount: number
  /** Tickers held with no thesis written. */
  missing: string[]
  /** Tickers whose current thesis is an AI draft saved without changes. */
  drafts: string[]
  /** Value held as cash rather than invested. */
  cash: number
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

/**
 * Value grouped under a label. Weights are a share of `total`, which defaults
 * to the holdings given; pass the whole portfolio's value to group a subset.
 */
function groupBy(
  holdings: Holding[],
  labelFor: (h: Holding) => string,
  total = holdings.reduce((sum, h) => sum + h.marketValue, 0)
): SectorSlice[] {
  const byLabel = new Map<string, number>()
  for (const h of holdings) {
    const label = labelFor(h)
    byLabel.set(label, (byLabel.get(label) ?? 0) + h.marketValue)
  }
  return [...byLabel.entries()]
    .map(([label, marketValue]) => ({
      label,
      marketValue,
      weight: total > 0 ? marketValue / total : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
}

const investedOf = <T extends { assetClass: AssetClass }>(holdings: T[]) =>
  holdings.filter((h) => h.assetClass !== 'cash')

/** Cash has no cost by design, so it isn't reported as a holding with its cost missing. */
function withoutCash(totals: PortfolioTotals, valued: (ValuedHolding & { assetClass: AssetClass })[]) {
  const cash = new Set(valued.filter((h) => h.assetClass === 'cash').map((h) => h.ticker))
  return { ...totals, uncosted: totals.uncosted.filter((ticker) => !cash.has(ticker)) }
}

function holdingName(
  h: AssetInput,
  profile: CompanyProfile | null,
  coin: string | null
): string | null {
  switch (kindOf(h.assetClass)) {
    case 'crypto':
      return coin
    case 'metal':
      return METALS[h.ticker] ? `${METALS[h.ticker]}, per troy ounce` : null
    case 'cash': {
      const currency = CURRENCIES.find((c) => c.code === h.ticker)
      return currency ? `Cash, ${currency.name}` : 'Cash'
    }
    default:
      return profile?.name ?? null
  }
}

export async function buildPortfolioView(
  portfolio: PortfolioRow,
  holdingRows: HoldingRow[],
  thesisRows: ThesisRow[],
  priceRows: PriceRow[],
  holdingHistory: PortfolioHistory = { available: false, entries: [] }
): Promise<PortfolioView> {
  const inputs = holdingRows.map(toHoldingInput)
  // Company details exist for listed tickers only; coins get a name from Coinbase.
  const listedTickers = [
    ...new Set(inputs.filter((h) => kindOf(h.assetClass) === 'listed').map((h) => h.ticker)),
  ]
  const coins = [...new Set(inputs.filter((h) => h.assetClass === 'crypto').map((h) => h.ticker))]

  const today = marketDate()
  const [quotes, profiles, coinNames, money] = await Promise.all([
    getAssetQuotes(inputs, lastClosesBefore(priceRows, today)),
    getProfiles(listedTickers),
    Promise.all(coins.map(async (coin) => [coin, await cryptoName(coin)] as const)),
    getMoney(),
  ])
  const coinName = new Map(coinNames)
  // Coins quoted directly in the display currency use that price; the rest stay
  // US-dollar prices, converted when shown. `quotes` stays in US dollars for saving.
  const shown = await withDirectQuotes(inputs, quotes, money)

  const thesesByHolding = new Map<string, Thesis[]>()
  for (const row of thesisRows) {
    const list = thesesByHolding.get(row.holding_id) ?? []
    list.push(toThesis(row))
    thesesByHolding.set(row.holding_id, list)
  }
  for (const list of thesesByHolding.values()) {
    list.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))
  }

  const valued = valueHoldings(inputs, shown)
  const holdings: Holding[] = valued.map((h) => {
    const versions = thesesByHolding.get(h.id) ?? []
    return {
      ...h,
      name: holdingName(h, profiles[h.ticker] ?? null, coinName.get(h.ticker) ?? null),
      industry: kindOf(h.assetClass) === 'listed' ? (profiles[h.ticker]?.industry ?? null) : null,
      thesis: versions[0] ?? null,
      thesisHistory: versions.slice(1),
      priceSource: shown[h.key]?.source ?? null,
    }
  })
  const totals = withoutCash(computeTotals(valued), valued)

  // Stored closes for past days, then today's live value on the end. With a
  // history, each past day counts what was actually held that day.
  const timeline = positionTimeline(holdingHistory.entries)
  const history = buildHistory(
    inputs,
    priceRows
      .map((p) => ({
        ticker: p.ticker,
        date: String(p.price_date).slice(0, 10),
        close: Number(p.close),
      }))
      .filter((p) => p.date < today),
    timeline.size > 0
      ? { keys: [...timeline.keys()], on: (key, date) => positionOn(timeline.get(key), date) }
      : undefined
  )
  if (holdings.length > 0 && totals.unpriced.length === 0) {
    history.push({ date: today, marketValue: totals.marketValue, costBasis: totals.costBasis })
  }

  return {
    portfolio,
    holdings,
    // A sector only means something for a stock, so only stocks are listed,
    // each as a share of the whole portfolio. "By asset type" covers the rest.
    sectors: groupBy(
      holdings.filter((h) => h.assetClass === 'stock'),
      (h) => h.industry ?? UNCLASSIFIED,
      totals.marketValue
    ),
    assetGroups: groupBy(holdings, (h) => groupLabel(h.assetClass)),
    hasCrypto: holdings.some((h) => h.assetClass === 'crypto'),
    totals,
    history,
    quotes,
    pricedIn: money.code,
    sharingAvailable: 'share_token' in portfolio,
    fetchedAt: Date.now(),
    holdingHistory,
    historyReplayed: timeline.size > 0,
  }
}

async function loadView(client: SupabaseClient, portfolio: PortfolioRow): Promise<PortfolioView> {
  const [holdings, holdingHistory] = await Promise.all([
    client.from('holdings').select('*').eq('portfolio_id', portfolio.id),
    getHistory(client, portfolio.id),
  ])
  if (holdings.error) throw new Error(holdings.error.message)
  const holdingRows = (holdings.data ?? []) as HoldingRow[]

  if (holdingRows.length === 0 && holdingHistory.entries.length === 0) {
    return buildPortfolioView(portfolio, [], [], [], holdingHistory)
  }

  const ids = holdingRows.map((h) => h.id)
  // Prices for what is held now, and for anything held before (sold since).
  const tickers = [
    ...new Set([...holdingRows.map((h) => toHoldingInput(h).key), ...holdingHistory.entries.map((e) => e.assetKey)]),
  ]
  const earliest = [
    ...holdingRows.map((h) => String(h.opened_at).slice(0, 10)),
    ...holdingHistory.entries.map((e) => e.tradeDate),
  ].sort()[0]

  const [theses, prices] = await Promise.all([
    ids.length > 0 ? client.from('theses').select('*').in('holding_id', ids) : { data: [], error: null },
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
    priceRows,
    holdingHistory
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

/**
 * The id used for messages that have no chat of their own: everything in a
 * database where supabase/chats.sql hasn't been run, and any stray message
 * saved without one.
 */
export const EARLIER_CHAT = 'earlier'

export interface Chat {
  id: string
  /** The first question asked in it, shortened. */
  title: string
  /** When its last message was saved. */
  updatedAt: string
  messages: MessageRow[]
}

const chatTitle = (messages: MessageRow[]): string => {
  const first = messages.find((m) => m.role === 'user') ?? messages[0]
  const text = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 64 ? `${text.slice(0, 63).trimEnd()}…` : text || 'Chat'
}

export interface PortfolioHistory {
  /** False until supabase/history.sql has been run. */
  available: boolean
  entries: HistoryEntry[]
}

/**
 * Every recorded change to a portfolio's holdings, newest first. History is a
 * nice-to-have: if it can't be read the page shows holdings without it.
 */
export async function getHistory(supabase: SupabaseClient, portfolioId: string): Promise<PortfolioHistory> {
  const { data, error } = await supabase
    .from('holding_history')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) return { available: !historyNotSetUp(error), entries: [] }
  const entries = (data ?? []).map((row) => toHistoryEntry(row as Record<string, unknown>))
  return { available: true, entries: entries.filter((e): e is HistoryEntry => e !== null) }
}

/**
 * A portfolio's assistant chats, most recently used first.
 *
 * `available` says whether the database can keep more than one (the chat_id
 * column from supabase/chats.sql exists). When it can't, everything is one
 * chat, exactly as before.
 */
export async function getChats(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<{ available: boolean; chats: Chat[] }> {
  const rows = await getMessages(supabase, portfolioId)

  let available: boolean
  if (rows.length > 0) {
    available = 'chat_id' in rows[0]
  } else {
    // Nothing saved yet, so ask for the column directly: an error means it isn't there.
    const probe = await supabase.from('messages').select('chat_id').limit(1)
    available = !probe.error
  }

  const groups = new Map<string, MessageRow[]>()
  for (const row of rows) {
    const key = available && row.chat_id ? row.chat_id : EARLIER_CHAT
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const chats = [...groups.entries()]
    .map(([id, messages]) => ({
      id,
      title: chatTitle(messages),
      updatedAt: messages[messages.length - 1].created_at,
      messages,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return { available, chats }
}

/**
 * Whether holdings can be crypto, metals, or cash yet: the asset_class column
 * from supabase/assets.sql exists.
 */
export async function assetTypesAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('holdings').select('asset_class').limit(1)
  return !error
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

  const allInputs = holdingRows.map(toHoldingInput)
  const keys = [...new Set(allInputs.map((h) => h.key))]
  const today = marketDate()
  const since = new Date(Date.now() - SPARKLINE_DAYS * 86_400_000).toISOString().slice(0, 10)

  const prices =
    keys.length > 0
      ? await supabase.from('prices').select('*').in('ticker', keys).gte('price_date', since)
      : { data: [] as PriceRow[], error: null }
  // The sparkline is decoration: if prices can't be read, cards simply go without.
  const priceRows = prices.error ? [] : ((prices.data ?? []) as PriceRow[])
  const [usdQuotes, money] = await Promise.all([
    getAssetQuotes(allInputs, lastClosesBefore(priceRows, today)),
    getMoney(),
  ])
  const quotes = await withDirectQuotes(allInputs, usdQuotes, money)
  const closes = priceRows
    .map((p) => ({
      ticker: p.ticker,
      date: String(p.price_date).slice(0, 10),
      close: Number(p.close),
    }))
    .filter((p) => p.date < today)

  return rows.map((portfolio) => {
    const inputs = (byPortfolio.get(portfolio.id) ?? []).map(toHoldingInput)
    const valued = valueHoldings(inputs, quotes)
    const totals = withoutCash(computeTotals(valued), valued)

    const history = buildHistory(inputs, closes)
    if (valued.length > 0 && totals.unpriced.length === 0) {
      history.push({ date: today, marketValue: totals.marketValue, costBasis: totals.costBasis })
    }

    return {
      portfolio,
      // Holdings and theses are about investments; cash is money held, not a position to justify.
      holdingCount: investedOf(valued).length,
      thesisCount: investedOf(valued).filter((h) => latest.has(h.id)).length,
      missing: investedOf(valued).filter((h) => !latest.has(h.id)).map((h) => h.ticker),
      drafts: investedOf(valued).filter((h) => latest.get(h.id)?.edited === false).map((h) => h.ticker),
      cash: valued.filter((h) => h.assetClass === 'cash').reduce((sum, h) => sum + h.marketValue, 0),
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
    // A fallback to the last saved price isn't a new price: saving it would file it under today.
    .filter((entry): entry is [string, Quote] => entry[1] !== null && entry[1].timestamp > 0 && !entry[1].source?.saved)
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
