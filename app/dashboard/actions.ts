'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { EARLIER_CHAT, getOwnedPortfolioView, getPortfolioRole, isUuid } from '@/lib/data'
import {
  getCompanyNews,
  getListing,
  getProfile,
  lookupQuote,
  searchSymbols,
  type SymbolMatch,
} from '@/lib/finnhub'
import { lookupCrypto } from '@/lib/asset-prices'
import {
  METALS,
  allowedGroups,
  guessFundGroup,
  isAssetClass,
  kindOf,
  listingTypeOf,
  normalizeAssetSymbol,
  priceKey,
  toAssetClass,
  type AssetClass,
  type ListingType,
} from '@/lib/assets'
import { CURRENCIES, isCurrency, money as inCurrency } from '@/lib/currency'
import { getRateOn } from '@/lib/fx'
import { formatShares, marketDate } from '@/lib/format'
import { ENTERED, historyNotSetUp, type HistoryKind } from '@/lib/history'
import { cashCovers, planBuy, planSale, unitsForMoney } from '@/lib/portfolio'
import { isIsoDate, saleDateProblem } from '@/lib/sale-date'
import { datedPrice, type DatedPrice } from '@/lib/dated-price'
import { outcomeMessage, type OutcomeStatus } from '@/lib/chat-actions'
import { getMoney } from '@/lib/money'
import { sourceLabel } from '@/lib/price-sources'
import { draftThesis, type ThesisDraft } from '@/lib/gemini'
import { normalizeShareCode, sharingNotSetUp, type MemberRole } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, HoldingRow } from '@/lib/types'

const SIGNED_OUT = 'Your session has expired. Log in again.'
const NOT_FOUND = 'Portfolio not found.'

type Supabase = Awaited<ReturnType<typeof createClient>>

// Every action re-checks the session and what this person may do with the
// portfolio. Row level security enforces the same rules again in the database.
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function refresh(portfolioId: string) {
  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/dashboard/${portfolioId}`)
}

type SignedInUser = { id: string; user_metadata?: Record<string, unknown> }

interface HistoryRecord {
  kind: HistoryKind
  quantity: number
  price?: number | null
  priceDate?: string | null
  priceSource?: string | null
  costBasis?: number | null
  quantityBefore?: number | null
  tradeDate: string
  cashChange?: number
  /** The cash line the money moved through, when it isn't US dollars. */
  cashCurrency?: string
}

/** The name shown beside a history entry: the profile's, else the account's. */
async function displayName(supabase: Supabase, user: SignedInUser): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  const fromProfile = typeof data?.display_name === 'string' ? data.display_name.trim() : ''
  const meta = user.user_metadata ?? {}
  const fromAccount = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : ''
  return fromProfile || fromAccount.trim() || null
}

const positiveOrNull = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)

/**
 * Adds an entry to a holding's history. Best effort: the holding itself is the
 * record of what is held, so a history that can't be written (for instance
 * before supabase/history.sql has been run) never blocks the change.
 */
async function logHistory(
  supabase: Supabase,
  user: SignedInUser,
  portfolioId: string,
  asset: { ticker: string; assetClass: AssetClass },
  record: HistoryRecord
): Promise<void> {
  const row = {
    portfolio_id: portfolioId,
    asset_key: priceKey(asset.ticker, asset.assetClass),
    ticker: asset.ticker,
    asset_class: asset.assetClass,
    kind: record.kind,
    quantity: Math.max(0, record.quantity),
    price: positiveOrNull(record.price),
    price_date: record.priceDate ?? null,
    price_source: record.priceSource ?? null,
    cost_basis: record.costBasis ?? null,
    quantity_before: record.quantityBefore ?? null,
    trade_date: record.tradeDate,
    cash_change: record.cashChange ?? 0,
    created_by: user.id,
    actor_name: await displayName(supabase, user),
    cash_currency: record.cashCurrency ?? 'USD',
  }
  let { error } = await supabase.from('holding_history').insert(row)
  // A table from before cash_currency existed (history.sql not re-run yet): keep the entry, minus that column.
  if (error && missingColumn(error)) {
    const { cash_currency: _currency, ...older } = row
    void _currency
    ;({ error } = await supabase.from('holding_history').insert(older))
  }
  if (error && !historyNotSetUp(error)) console.error('Could not add to the holding history:', error.message)
}

/**
 * What the signed-in user may do with this portfolio: 'owner', 'editor',
 * 'viewer', or null if they can't see it at all. Being able to see a
 * portfolio is no longer the same as owning it, so every action asks.
 */
async function roleOn(supabase: Supabase, userId: string, portfolioId: string) {
  if (!isUuid(portfolioId)) return null
  const { data } = await supabase
    .from('portfolios')
    .select('id, user_id')
    .eq('id', portfolioId)
    .maybeSingle()
  if (!data) return null
  return getPortfolioRole(supabase, data as { id: string; user_id: string }, userId)
}

/** Only the owner renames, deletes, shares, or clears the assistant conversation. */
async function ownsPortfolio(supabase: Supabase, userId: string, portfolioId: string) {
  return (await roleOn(supabase, userId, portfolioId)) === 'owner'
}

/** The owner and anyone invited as an editor may change holdings and theses. */
async function canEdit(supabase: Supabase, userId: string, portfolioId: string) {
  const role = await roleOn(supabase, userId, portfolioId)
  return role === 'owner' || role === 'editor'
}

const VIEW_ONLY = 'This portfolio was shared with you as view-only, so you can’t change it.'

async function findHolding(
  supabase: Supabase,
  portfolioId: string,
  holdingId: string
): Promise<HoldingRow | null> {
  if (!isUuid(portfolioId) || !isUuid(holdingId)) return null
  const { data } = await supabase
    .from('holdings')
    .select('*')
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle()
  return (data as HoldingRow | null) ?? null
}

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

type PortfolioFields =
  | { valid: true; name: string; mandate: string | null }
  | { valid: false; error: string }

function validatePortfolioFields(formData: FormData): PortfolioFields {
  const name = text(formData, 'name')
  const mandate = text(formData, 'mandate')
  if (!name) return { valid: false, error: 'Give the portfolio a name.' }
  if (name.length > 80) return { valid: false, error: 'Keep the name under 80 characters.' }
  if (mandate.length > 500) {
    return { valid: false, error: 'Keep the mandate under 500 characters.' }
  }
  return { valid: true, name, mandate: mandate || null }
}

export async function createPortfolio(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  const fields = validatePortfolioFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({ user_id: user.id, name: fields.name, mandate: fields.mandate })
    .select('id')
    .single()

  if (error || !data) {
    // 42501: row level security refused the insert, which means the owner
    // policies from supabase/setup.sql aren't in place yet.
    if (error?.code === '42501') {
      return {
        ok: false,
        error:
          'The database refused to save this. Run supabase/setup.sql in the Supabase SQL editor to add the access rules, then try again.',
      }
    }
    return { ok: false, error: 'Could not create the portfolio. Try again.' }
  }

  revalidatePath('/dashboard', 'layout')
  redirect(`/dashboard/${data.id}`)
}

export async function updatePortfolio(
  portfolioId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const fields = validatePortfolioFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { data, error } = await supabase
    .from('portfolios')
    .update({ name: fields.name, mandate: fields.mandate })
    .eq('id', portfolioId)
    // Only the owner renames a portfolio or rewrites its purpose.
    .eq('user_id', user.id)
    .select('id')

  if (error) return { ok: false, error: 'Could not save the changes. Try again.' }
  if (!data?.length) return { ok: false, error: NOT_FOUND }

  refresh(portfolioId)
  return { ok: true }
}

export async function deletePortfolio(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  // Remove children first, in dependency order, so this works whether or not
  // the foreign keys were created with ON DELETE CASCADE.
  const failed = { ok: false, error: 'Could not delete the portfolio. Try again.' } as const

  const { data: holdings, error: holdingsError } = await supabase
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
  if (holdingsError) return failed

  const holdingIds = (holdings ?? []).map((h) => h.id as string)
  if (holdingIds.length > 0) {
    const theses = await supabase.from('theses').delete().in('holding_id', holdingIds)
    if (theses.error) return failed
  }
  const removedHoldings = await supabase.from('holdings').delete().eq('portfolio_id', portfolioId)
  if (removedHoldings.error) return failed
  const removedMessages = await supabase.from('messages').delete().eq('portfolio_id', portfolioId)
  if (removedMessages.error) return failed

  const { error } = await supabase.from('portfolios').delete().eq('id', portfolioId)
  if (error) return failed

  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/portfolios')
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

const ASSETS_NOT_SET_UP =
  'Crypto, gold and silver, and cash need one more database script. Run supabase/assets.sql in the Supabase SQL editor.'

/** The asset_class column is missing until supabase/assets.sql has been run. */
const missingColumn = (error: { code?: string } | null) =>
  error?.code === 'PGRST204' || error?.code === '42703'

/** "S$5,000.00": an amount in its own currency. */
const inOwnCurrency = (amount: number, code: string) => inCurrency(amount, { code, rate: 1 })
const currencyName = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code

function dateProblem(value: string, label: string): string | null {
  if (!isIsoDate(value)) return `Pick the ${label}.`
  if (value > marketDate()) return `The ${label} can’t be in the future.`
  if (value < '1970-01-01') return 'That date is too far back.'
  return null
}

/** An amount and an optional average cost, as typed. */
function readAmounts(
  formData: FormData,
  /** False when the quantity is worked out from an amount spent instead. */
  needQuantity = true
): { ok: true; quantity: number; costBasis: number | null } | { ok: false; error: string } {
  const quantity = needQuantity ? Number(text(formData, 'quantity')) : 0
  const costText = text(formData, 'cost_basis')
  const costBasis = costText === '' ? null : Number(costText)
  if (needQuantity && (!Number.isFinite(quantity) || quantity <= 0)) {
    return { ok: false, error: 'Enter an amount greater than zero.' }
  }
  if (costBasis !== null && (!Number.isFinite(costBasis) || costBasis <= 0)) {
    return { ok: false, error: 'Average cost must be a number greater than zero, or left blank.' }
  }
  if (quantity > 1e12 || (costBasis !== null && costBasis > 1e12)) {
    return { ok: false, error: 'That number is too large.' }
  }
  return { ok: true, quantity, costBasis }
}

// ---------------------------------------------------------------------------
// Exchange rates and prices
// ---------------------------------------------------------------------------

/** Units of `currency` per US dollar on that date (today: live). Null if none can be found. */
async function rateFor(currency: string, date: string): Promise<number | null> {
  if (currency === 'USD') return 1
  return (await getRateOn(currency, date, marketDate()))?.rate ?? null
}

/**
 * A purchase entered as the money spent rather than how many: the number
 * bought is worked out here, at the same price that is recorded, so the cost
 * on record is the amount typed.
 */
async function unitsForSpend(
  amountInput: string,
  currencyInput: string,
  price: number,
  date: string
): Promise<{ ok: true; quantity: number; amount: number; currency: string } | { ok: false; error: string }> {
  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    return { ok: false, error: 'Enter how much you spent, more than zero.' }
  }
  const currency = currencyInput || 'USD'
  if (!isCurrency(currency)) return { ok: false, error: 'Choose the currency you paid in.' }
  const rate = await rateFor(currency, date)
  if (rate === null) return { ok: false, error: NO_RATE(currency) }
  const quantity = unitsForMoney(amount, rate, price)
  if (quantity === null) return { ok: false, error: 'That amount is too small to buy any at this price.' }
  return { ok: true, quantity, amount, currency }
}

const NO_RATE = (code: string) =>
  `No ${currencyName(code)} exchange rate could be found for that date. Try again in a minute, or use US dollars.`

/** For the forms' previews: units of `currency` per US dollar on a date. */
export async function getRateOnDate(currencyInput: string, dateInput: string): Promise<number | null> {
  const { user } = await requireUser()
  if (!user || !isCurrency(currencyInput) || !isIsoDate(dateInput)) return null
  return rateFor(currencyInput, dateInput)
}

/** FolioQ's own saved daily prices for one key, between two dates. */
function savedCloses(supabase: Supabase) {
  return async (key: string, from: string, to: string) => {
    const { data, error } = await supabase
      .from('prices')
      .select('price_date, close')
      .eq('ticker', key)
      .gte('price_date', from)
      .lte('price_date', to)
    if (error || !data) return []
    return data.map((row) => ({ date: String(row.price_date).slice(0, 10), close: Number(row.close) }))
  }
}

interface TradePrice {
  price: number
  /** The close's trading day; null for a live or typed-in price. */
  priceDate: string | null
  /** Where it came from; null when typed in. */
  source: string | null
}

/**
 * The market price on a date. A price typed in by hand is only used when no
 * source has one (a delisted share, a long outage), and is recorded as such.
 */
async function resolvePrice(
  supabase: Supabase,
  item: { ticker: string; assetClass: AssetClass },
  date: string,
  manualInput: string | undefined
): Promise<{ ok: true; value: TradePrice } | { ok: false; error: string }> {
  const found = await datedPrice(item, date, marketDate(), savedCloses(supabase), await getMoney())
  if (found.ok) {
    return {
      ok: true,
      // The source is kept with its pair when it was quoted directly: "Independent Reserve (BTC/SGD)".
      value: { price: found.price, priceDate: found.basis === 'close' ? found.date : null, source: sourceLabel(found.source) },
    }
  }
  const manual = Number(manualInput)
  if (manualInput && Number.isFinite(manual) && manual > 0 && manual < 1e9) {
    return { ok: true, value: { price: manual, priceDate: null, source: null } }
  }
  return found
}

// ---------------------------------------------------------------------------
// What a listed ticker is, and which group fits it
// ---------------------------------------------------------------------------

export interface Classification {
  type: ListingType
  /** The group it should start in. */
  suggested: AssetClass
  /** Its listed name, e.g. "SPDR GOLD SHARES". */
  name: string | null
}

/** For Add a holding: whether a ticker is a company, a REIT, or a fund, and the group it fits. */
export async function classifyTicker(symbolInput: string): Promise<Classification> {
  const { user } = await requireUser()
  const ticker = user && typeof symbolInput === 'string' ? normalizeAssetSymbol(symbolInput, 'stock') : null
  if (!ticker) return { type: 'unknown', suggested: 'stock', name: null }
  const listing = await getListing(ticker)
  const type = listingTypeOf(listing?.type)
  const suggested = type === 'company' ? 'stock' : type === 'reit' ? 'property' : guessFundGroup(listing?.description)
  return { type, suggested, name: listing?.description ?? null }
}

/**
 * A group that fits what the ticker is: a company's shares are a stock, a
 * REIT is property, a fund any fund group. Checked on the server, so the
 * label can't be wrong whatever the form sends.
 */
async function fittingGroup(ticker: string, wanted: AssetClass): Promise<AssetClass> {
  const allowed = allowedGroups(listingTypeOf((await getListing(ticker))?.type))
  return allowed.includes(wanted) ? wanted : allowed[0]
}

// ---------------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------------

const NO_CASH_TABLE = 'Could not reach this portfolio’s cash. Try again.'

/**
 * Moves one of the portfolio's cash lines by `amount`, in that currency:
 * positive puts money in (creating the line if there isn't one), negative
 * takes it out (never below zero; taking all of it removes the line). Returns
 * how to put it back, so a change that fails halfway leaves cash as it was.
 */
async function moveCash(
  supabase: Supabase,
  portfolioId: string,
  currency: string,
  amount: number,
  { openedAt, short }: { openedAt: string; short: (have: string, need: string) => string }
): Promise<{ ok: true; undo: () => Promise<void> } | { ok: false; error: string }> {
  const { data: cash, error: lookupError } = await supabase
    .from('holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('ticker', currency)
    .eq('asset_class', 'cash')
    .maybeSingle()
  if (lookupError) return { ok: false, error: missingColumn(lookupError) ? ASSETS_NOT_SET_UP : NO_CASH_TABLE }

  if (!cash) {
    if (amount < 0) return { ok: false, error: short(inOwnCurrency(0, currency), inOwnCurrency(-amount, currency)) }
    const { data: created, error } = await supabase
      .from('holdings')
      .insert({ portfolio_id: portfolioId, ticker: currency, asset_class: 'cash', quantity: amount, cost_basis: null, opened_at: openedAt })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: missingColumn(error) ? ASSETS_NOT_SET_UP : NO_CASH_TABLE }
    return { ok: true, undo: async () => void (await supabase.from('holdings').delete().eq('id', created.id)) }
  }

  const before = Number(cash.quantity)
  if (!cashCovers(before, -amount)) {
    return { ok: false, error: short(inOwnCurrency(before, currency), inOwnCurrency(-amount, currency)) }
  }
  const after = before + amount
  // Spent to the last cent (or within rounding of it): the line goes rather than sit at zero.
  if (after < 0.005) {
    const { error } = await supabase.from('holdings').delete().eq('id', cash.id)
    if (error) return { ok: false, error: NO_CASH_TABLE }
    return { ok: true, undo: async () => void (await supabase.from('holdings').insert(cash)) }
  }
  const { error } = await supabase.from('holdings').update({ quantity: after }).eq('id', cash.id)
  if (error) return { ok: false, error: NO_CASH_TABLE }
  return { ok: true, undo: async () => void (await supabase.from('holdings').update({ quantity: before }).eq('id', cash.id)) }
}

const SHORT_TO_PAY = (code: string) => (have: string, need: string) =>
  `That costs ${need}, but this portfolio has ${have} in ${currencyName(code)} cash. Buy less, or pay another way.`

/**
 * Puts money into, or takes it out of, the portfolio's cash in any currency,
 * on a date. Recorded in the history as a deposit or a withdrawal.
 */
export async function moveMoney(
  portfolioId: string,
  direction: 'in' | 'out',
  currencyInput: string,
  amountInput: string,
  dateInput: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }
  if (!isCurrency(currencyInput)) return { ok: false, error: 'Choose a currency.' }
  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    return { ok: false, error: 'Enter an amount greater than zero.' }
  }
  const problem = dateProblem(dateInput, 'date')
  if (problem) return { ok: false, error: problem }

  const cash = await moveCash(supabase, portfolioId, currencyInput, direction === 'in' ? amount : -amount, {
    openedAt: dateInput,
    short: (have) => `This portfolio has ${have} in ${currencyName(currencyInput)} cash. Take out less.`,
  })
  if (!cash.ok) return cash

  await logHistory(supabase, user, portfolioId, { ticker: currencyInput, assetClass: 'cash' }, {
    kind: direction === 'in' ? 'deposited' : 'withdrawn',
    quantity: amount,
    tradeDate: dateInput,
  })
  refresh(portfolioId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Adding, correcting, and deleting holdings
// ---------------------------------------------------------------------------

/**
 * Adds a holding. Two ways in, as the form asks:
 *   bought  a purchase just made: priced at the market on the date bought,
 *           and optionally paid from one of the portfolio's cash lines
 *   owned   something already owned: its average cost is typed in, in US
 *           dollars or another currency (converted at that date's rate)
 * Cash is simply an amount in a currency.
 */
export async function addHolding(portfolioId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const classInput = text(formData, 'asset_class') || 'stock'
  if (!isAssetClass(classInput)) return { ok: false, error: 'Choose what kind of holding this is.' }
  let assetClass: AssetClass = classInput
  const kind = kindOf(assetClass)

  const ticker = normalizeAssetSymbol(text(formData, 'ticker'), assetClass)
  if (!ticker || (kind === 'cash' && !isCurrency(ticker))) {
    const ask = {
      listed: 'Enter a ticker symbol, like AAPL.',
      crypto: 'Enter the coin’s symbol, like BTC or ETH.',
      metal: 'Choose gold or silver.',
      cash: 'Choose the currency the cash is held in.',
    }
    return { ok: false, error: ask[kind] }
  }

  // A purchase can be entered as the money spent; the quantity then follows from the price.
  const boughtBySpend = kind !== 'cash' && text(formData, 'how') === 'bought' && text(formData, 'spend') !== ''
  const amounts = readAmounts(formData, !boughtBySpend)
  if (!amounts.ok) return amounts
  let quantity = amounts.quantity
  const openedAt = text(formData, 'opened_at')
  const badDate = dateProblem(openedAt, kind === 'cash' ? 'date' : 'date bought')
  if (badDate) return { ok: false, error: badDate }

  // One holding per thing per portfolio: the same coin twice, or the same
  // ticker under two groupings, would double-count it.
  const { data: existing, error: existingError } = await supabase
    .from('holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('ticker', ticker)
  if (existingError) return { ok: false, error: 'Could not check existing holdings. Try again.' }
  const key = priceKey(ticker, assetClass)
  const clash = (existing ?? []).find(
    (row) => priceKey(String(row.ticker), toAssetClass(row.asset_class)) === key
  )
  if (clash) {
    const what = kind === 'cash' ? `${ticker} cash` : kind === 'metal' ? METALS[ticker] : ticker
    return {
      ok: false,
      error: `${what} is already in this portfolio. ${kind === 'cash' ? 'Use Add money on the Cash card.' : 'Use Buy on its row to add to it.'}`,
    }
  }

  // Reject things the price sources have never heard of. If a source is
  // unreachable we let it through rather than block bookkeeping.
  if (kind === 'listed') {
    const lookup = await lookupQuote(ticker)
    if (lookup.status === 'unknown') {
      return { ok: false, error: `No market data for “${ticker}”. Check the ticker symbol.` }
    }
    assetClass = await fittingGroup(ticker, assetClass)
  } else if (kind === 'crypto') {
    const lookup = await lookupCrypto(ticker)
    if (lookup.status === 'unknown') {
      return { ok: false, error: `Neither Coinbase nor Kraken lists a coin called “${ticker}”. Check the symbol.` }
    }
  }

  let costBasis: number | null = null
  let undoCash = async () => {}
  let priced: TradePrice | null = null
  let cashChange = 0
  let cashCurrency = 'USD'

  if (kind !== 'cash' && text(formData, 'how') === 'bought') {
    // Bought just now: the market sets the price, not the form.
    const found = await resolvePrice(supabase, { ticker, assetClass }, openedAt, text(formData, 'manual_price'))
    if (!found.ok) return found
    priced = found.value
    costBasis = priced.price
    let spent: { amount: number; currency: string } | null = null
    if (boughtBySpend) {
      const spend = await unitsForSpend(text(formData, 'spend'), text(formData, 'spend_currency'), priced.price, openedAt)
      if (!spend.ok) return spend
      quantity = spend.quantity
      spent = spend
    }
    const payFrom = text(formData, 'pay_from')
    if (payFrom) {
      if (!isCurrency(payFrom)) return { ok: false, error: 'Choose which cash to pay from.' }
      const rate = await rateFor(payFrom, openedAt)
      if (rate === null) return { ok: false, error: NO_RATE(payFrom) }
      // Paid in the cash's own currency: exactly what was typed leaves the cash.
      const amount = spent?.currency === payFrom ? spent.amount : quantity * priced.price * rate
      const cash = await moveCash(supabase, portfolioId, payFrom, -amount, { openedAt, short: SHORT_TO_PAY(payFrom) })
      if (!cash.ok) return cash
      undoCash = cash.undo
      cashChange = -amount
      cashCurrency = payFrom
    }
  } else if (kind !== 'cash' && amounts.costBasis !== null) {
    // Already owned: the average cost as typed, in whichever currency it was typed in.
    const costCurrency = text(formData, 'cost_currency') || 'USD'
    if (!isCurrency(costCurrency)) return { ok: false, error: 'Choose the currency of the average cost.' }
    const rate = await rateFor(costCurrency, openedAt)
    if (rate === null) return { ok: false, error: NO_RATE(costCurrency) }
    costBasis = amounts.costBasis / rate
  }

  const { error } = await supabase.from('holdings').insert({
    portfolio_id: portfolioId,
    ticker,
    quantity,
    // Cash has no cost: its value is simply the amount held.
    cost_basis: costBasis,
    opened_at: openedAt,
    // Only sent when it isn't a plain stock, so stocks can still be added
    // before supabase/assets.sql has been run.
    ...(assetClass === 'stock' ? {} : { asset_class: assetClass }),
  })
  if (error) {
    await undoCash()
    return { ok: false, error: missingColumn(error) ? ASSETS_NOT_SET_UP : 'Could not save the holding. Try again.' }
  }

  await logHistory(supabase, user, portfolioId, { ticker, assetClass }, {
    kind: 'opened',
    quantity,
    price: costBasis,
    priceDate: priced?.priceDate ?? null,
    // A purchase priced by the market names its source; typed-in prices and costs don't.
    priceSource: priced ? (priced.source ?? ENTERED) : null,
    tradeDate: openedAt,
    cashChange,
    cashCurrency,
  })

  refresh(portfolioId)
  return { ok: true }
}

/**
 * Edits a holding's details: its group (for a fund) and the date it was
 * opened. Changing the amount or the average cost is a separate, deliberate
 * step ("Fix a mistake", sent as fix=on), recorded in the history as a
 * correction. Buying and selling go through Buy and Sell instead.
 */
export async function updateHolding(
  portfolioId: string,
  holdingId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const current = await findHolding(supabase, portfolioId, holdingId)
  if (!current) return { ok: false, error: 'Holding not found.' }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const currentClass = toAssetClass(current.asset_class)
  const kind = kindOf(currentClass)
  const openedAt = text(formData, 'opened_at') || String(current.opened_at).slice(0, 10)
  const badDate = dateProblem(openedAt, kind === 'cash' ? 'date' : 'date opened')
  if (badDate) return { ok: false, error: badDate }

  // A fund can be regrouped (Bond fund, Property fund...); a company stays a
  // stock, and a coin, a metal or cash stays what it is.
  const regroup = text(formData, 'asset_class')
  const newClass =
    kind === 'listed' && isAssetClass(regroup) && kindOf(regroup) === 'listed'
      ? await fittingGroup(current.ticker, regroup)
      : currentClass

  const oldQuantity = Number(current.quantity)
  const oldCost = current.cost_basis === null ? null : Number(current.cost_basis)
  let quantity = oldQuantity
  let costBasis = oldCost
  if (text(formData, 'fix') === 'on') {
    const amounts = readAmounts(formData)
    if (!amounts.ok) return amounts
    quantity = amounts.quantity
    if (kind === 'cash') costBasis = null
    // Not sent: the cost stays as it was.
    else if (!formData.has('cost_basis')) costBasis = oldCost
    else if (amounts.costBasis === null) costBasis = null
    else {
      const costCurrency = text(formData, 'cost_currency') || 'USD'
      if (!isCurrency(costCurrency)) return { ok: false, error: 'Choose the currency of the average cost.' }
      const rate = await rateFor(costCurrency, openedAt)
      if (rate === null) return { ok: false, error: NO_RATE(costCurrency) }
      costBasis = amounts.costBasis / rate
    }
  }

  const { error } = await supabase
    .from('holdings')
    .update({
      quantity,
      cost_basis: costBasis,
      opened_at: openedAt,
      ...(newClass !== currentClass ? { asset_class: newClass } : {}),
    })
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
  if (error) {
    return { ok: false, error: missingColumn(error) ? ASSETS_NOT_SET_UP : 'Could not save the holding. Try again.' }
  }

  // A correction to the amount or the cost goes in the history, with what it was before.
  const costChanged = oldCost === null || costBasis === null ? oldCost !== costBasis : Math.abs(oldCost - costBasis) > 1e-9
  if (oldQuantity !== quantity || costChanged) {
    await logHistory(supabase, user, portfolioId, { ticker: current.ticker, assetClass: newClass }, {
      kind: 'corrected',
      quantity,
      price: costBasis,
      costBasis: oldCost,
      quantityBefore: oldQuantity,
      tradeDate: marketDate(),
    })
  }

  refresh(portfolioId)
  return { ok: true }
}

export async function deleteHolding(portfolioId: string, holdingId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const holding = await findHolding(supabase, portfolioId, holdingId)
  if (!holding) return { ok: false, error: 'Holding not found.' }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const failed = { ok: false, error: 'Could not delete the holding. Try again.' } as const
  const theses = await supabase.from('theses').delete().eq('holding_id', holdingId)
  if (theses.error) return failed
  const { error } = await supabase
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
  if (error) return failed

  await logHistory(supabase, user, portfolioId, { ticker: holding.ticker, assetClass: toAssetClass(holding.asset_class) }, {
    kind: 'removed',
    quantity: 0,
    quantityBefore: Number(holding.quantity),
    costBasis: holding.cost_basis === null ? null : Number(holding.cost_basis),
    tradeDate: marketDate(),
  })

  refresh(portfolioId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Buying and selling: priced from the date, paid from or into cash
// ---------------------------------------------------------------------------

export type Side = 'buy' | 'sell'

export type SaleResult =
  | {
      ok: true
      /** In US dollars. */
      proceeds: number
      sellsAll: boolean
      realizedGain: number | null
      price: number
      /** The cash line the money went into, and how much in its currency. */
      into: string
      intoAmount: number
    }
  | { ok: false; error: string }

export type BuyResult =
  | {
      ok: true
      /** In US dollars. */
      cost: number
      price: number
      /** How many were bought (worked out here when the purchase was entered as money spent). */
      quantity: number
      /** The cash line it was paid from (null: money from outside FolioQ), and how much in its currency. */
      paidFrom: string | null
      paidAmount: number
    }
  | { ok: false; error: string }

/** A buy can be on any past date; a sale can't be before the holding was bought. */
function tradeDateProblem(side: Side, date: unknown, openedAt: string, today: string): string | null {
  return saleDateProblem(date, { openedAt: side === 'sell' ? openedAt : '1970-01-01', today })
}

/** The holding, checked for a trade on that date by this user. */
async function checkTrade(
  supabase: Supabase,
  userId: string,
  portfolioId: string,
  holdingId: string,
  dateInput: unknown,
  side: Side
): Promise<{ ok: true; holding: HoldingRow; assetClass: AssetClass } | { ok: false; error: string }> {
  const holding = await findHolding(supabase, portfolioId, holdingId)
  if (!holding) return { ok: false, error: 'Holding not found.' }
  if (!(await canEdit(supabase, userId, portfolioId))) return { ok: false, error: VIEW_ONLY }
  const assetClass = toAssetClass(holding.asset_class)
  if (kindOf(assetClass) === 'cash') return { ok: false, error: 'Cash isn’t bought or sold. Use Add money or Take money out.' }
  const problem = tradeDateProblem(side, dateInput, String(holding.opened_at), marketDate())
  if (problem) return { ok: false, error: problem }
  return { ok: true, holding, assetClass }
}

/**
 * The price a purchase or sale on that date would be recorded at: the live
 * price for today, otherwise that day's close. What the form shows before you confirm.
 */
export async function getTradePrice(
  portfolioId: string,
  holdingId: string,
  dateInput: string,
  side: Side
): Promise<DatedPrice> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const found = await checkTrade(supabase, user.id, portfolioId, holdingId, dateInput, side === 'buy' ? 'buy' : 'sell')
  if (!found.ok) return found
  return datedPrice(
    { ticker: found.holding.ticker, assetClass: found.assetClass },
    dateInput,
    marketDate(),
    savedCloses(supabase),
    await getMoney()
  )
}

/** The price of something not yet held, on a date: for "Add a holding" when it was just bought. */
export async function getPriceOn(symbolInput: string, classInput: string, dateInput: string): Promise<DatedPrice> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const assetClass = toAssetClass(classInput)
  const ticker = typeof symbolInput === 'string' ? normalizeAssetSymbol(symbolInput, assetClass) : null
  if (!ticker) return { ok: false, error: 'Enter what you bought first.' }
  const today = marketDate()
  const problem = tradeDateProblem('buy', dateInput, '1970-01-01', today)
  if (problem) return { ok: false, error: problem }
  return datedPrice({ ticker, assetClass }, dateInput, today, savedCloses(supabase), await getMoney())
}

/**
 * Sells some or all of a holding. The price isn't typed in: it is the market
 * price on the date of the sale (live for today, else that day's close),
 * looked up here on the server; only if no source has one may a price be
 * typed in. The money goes into the cash line chosen (`into`, US dollars by
 * default), converted at that day's rate. Selling everything removes the
 * holding and its thesis.
 */
export async function sellHolding(
  portfolioId: string,
  holdingId: string,
  quantityInput: string,
  dateInput: string,
  options: { into?: string; manualPrice?: string } = {}
): Promise<SaleResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  const quantity = Number(quantityInput)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Enter how much you sold, more than zero.' }
  }

  const found = await checkTrade(supabase, user.id, portfolioId, holdingId, dateInput, 'sell')
  if (!found.ok) return found
  const { holding, assetClass } = found
  const held = Number(holding.quantity)
  if (quantity > held * (1 + 1e-9)) {
    return { ok: false, error: `You only hold ${formatShares(held)}. Enter that or less.` }
  }

  const priced = await resolvePrice(supabase, { ticker: holding.ticker, assetClass }, dateInput, options.manualPrice)
  if (!priced.ok) return priced
  const price = priced.value.price

  const into = options.into && isCurrency(options.into) ? options.into : 'USD'
  const rate = await rateFor(into, dateInput)
  if (rate === null) return { ok: false, error: NO_RATE(into) }

  const sale = planSale(
    { quantity: held, costBasis: holding.cost_basis === null ? null : Number(holding.cost_basis) },
    quantity,
    price
  )
  const intoAmount = sale.proceeds * rate

  // 1. The money arrives in cash first; if the next step fails it is taken back out.
  const cash = await moveCash(supabase, portfolioId, into, intoAmount, { openedAt: dateInput, short: SHORT_TO_PAY(into) })
  if (!cash.ok) return cash

  // 2. Then the holding shrinks, or goes.
  let failed: boolean
  if (sale.sellsAll) {
    const theses = await supabase.from('theses').delete().eq('holding_id', holdingId)
    const removed = theses.error
      ? theses
      : await supabase.from('holdings').delete().eq('id', holdingId).eq('portfolio_id', portfolioId)
    failed = Boolean(removed.error)
  } else {
    const { error } = await supabase
      .from('holdings')
      .update({ quantity: sale.remaining })
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
    failed = Boolean(error)
  }
  if (failed) {
    await cash.undo()
    return { ok: false, error: 'Could not record the sale. Nothing was changed. Try again.' }
  }

  await logHistory(supabase, user, portfolioId, { ticker: holding.ticker, assetClass }, {
    kind: 'sold',
    quantity: Math.min(quantity, held),
    price,
    priceDate: priced.value.priceDate,
    priceSource: priced.value.source ?? ENTERED,
    costBasis: holding.cost_basis === null ? null : Number(holding.cost_basis),
    quantityBefore: held,
    tradeDate: dateInput,
    cashChange: intoAmount,
    cashCurrency: into,
  })

  refresh(portfolioId)
  return {
    ok: true,
    proceeds: sale.proceeds,
    sellsAll: sale.sellsAll,
    realizedGain: sale.realizedGain,
    price,
    into,
    intoAmount,
  }
}

/**
 * Buys more of a holding, priced at the market on the date bought (or a typed
 * price, only when no source has one). The quantity goes up and the average
 * cost is reworked. With `payFrom`, the cost comes out of that cash line,
 * converted at the day's rate, and the purchase is refused if it doesn't cover it.
 */
export async function buyMore(
  portfolioId: string,
  holdingId: string,
  quantityInput: string,
  dateInput: string,
  options: {
    payFrom?: string | null
    manualPrice?: string
    /** Entered as money spent instead of a quantity: the quantity is worked out from the price. */
    spend?: { amount: string; currency: string }
  } = {}
): Promise<BuyResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  let quantity = Number(quantityInput)
  if (!options.spend && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e12)) {
    return { ok: false, error: 'Enter how much you bought, more than zero.' }
  }

  const found = await checkTrade(supabase, user.id, portfolioId, holdingId, dateInput, 'buy')
  if (!found.ok) return found
  const { holding, assetClass } = found
  const priced = await resolvePrice(supabase, { ticker: holding.ticker, assetClass }, dateInput, options.manualPrice)
  if (!priced.ok) return priced
  const price = priced.value.price
  let spent: { amount: number; currency: string } | null = null
  if (options.spend) {
    const spend = await unitsForSpend(String(options.spend.amount), String(options.spend.currency), price, dateInput)
    if (!spend.ok) return spend
    quantity = spend.quantity
    spent = spend
  }
  const buy = planBuy(
    { quantity: Number(holding.quantity), costBasis: holding.cost_basis === null ? null : Number(holding.cost_basis) },
    quantity,
    price
  )

  // 1. Pay first, if paying from cash; put it back if the holding can't be updated.
  const payFrom = options.payFrom && isCurrency(options.payFrom) ? options.payFrom : null
  let undo = async () => {}
  let paidAmount = 0
  if (payFrom) {
    const rate = await rateFor(payFrom, dateInput)
    if (rate === null) return { ok: false, error: NO_RATE(payFrom) }
    paidAmount = spent?.currency === payFrom ? spent.amount : buy.cost * rate
    const cash = await moveCash(supabase, portfolioId, payFrom, -paidAmount, { openedAt: dateInput, short: SHORT_TO_PAY(payFrom) })
    if (!cash.ok) return cash
    undo = cash.undo
  }

  // 2. Then the holding grows. Bought earlier than it was opened? It now opened then.
  const openedAt = String(holding.opened_at).slice(0, 10)
  const { error } = await supabase
    .from('holdings')
    .update({
      quantity: buy.quantity,
      cost_basis: buy.costBasis,
      ...(dateInput < openedAt ? { opened_at: dateInput } : {}),
    })
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
  if (error) {
    await undo()
    return { ok: false, error: 'Could not record the purchase. Nothing was changed. Try again.' }
  }

  await logHistory(supabase, user, portfolioId, { ticker: holding.ticker, assetClass }, {
    kind: 'bought',
    quantity,
    price,
    priceDate: priced.value.priceDate,
    priceSource: priced.value.source ?? ENTERED,
    costBasis: holding.cost_basis === null ? null : Number(holding.cost_basis),
    quantityBefore: Number(holding.quantity),
    tradeDate: dateInput,
    cashChange: payFrom ? -paidAmount : 0,
    cashCurrency: payFrom ?? 'USD',
  })

  refresh(portfolioId)
  return { ok: true, cost: buy.cost, price, quantity, paidFrom: payFrom, paidAmount }
}

// ---------------------------------------------------------------------------
// Theses
// ---------------------------------------------------------------------------

function cleanList(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null
  const list = items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  if (list.length > 12 || list.some((item) => item.length > 400)) return null
  return list
}

/** Saves a new version of a holding's thesis. Earlier versions are kept. */
export async function saveThesis(
  portfolioId: string,
  holdingId: string,
  input: { claim: string; assumptions: string[]; risks: string[]; authorEdited: boolean }
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await findHolding(supabase, portfolioId, holdingId))) {
    return { ok: false, error: 'Holding not found.' }
  }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const claim = typeof input?.claim === 'string' ? input.claim.trim() : ''
  const assumptions = cleanList(input?.assumptions)
  const risks = cleanList(input?.risks)

  if (!claim) return { ok: false, error: 'Write the claim: why does this position belong here?' }
  if (claim.length > 1000) return { ok: false, error: 'Keep the claim under 1,000 characters.' }
  if (!assumptions || !risks) {
    return {
      ok: false,
      error: 'Use at most 12 assumptions and 12 risks, each under 400 characters.',
    }
  }

  const { data: versions, error: versionsError } = await supabase
    .from('theses')
    .select('version')
    .eq('holding_id', holdingId)
  if (versionsError) return { ok: false, error: 'Could not load the current thesis. Try again.' }
  const next = Math.max(0, ...(versions ?? []).map((v) => Number(v.version) || 0)) + 1

  const { error } = await supabase.from('theses').insert({
    holding_id: holdingId,
    version: next,
    claim,
    assumptions,
    risks,
    author_edited: Boolean(input.authorEdited),
  })
  if (error) return { ok: false, error: 'Could not save the thesis. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export type DraftResult = { ok: true; draft: ThesisDraft } | { ok: false; error: string }

/** Asks the AI for a first draft. Nothing is saved until the owner saves it. */
export async function draftThesisForHolding(
  portfolioId: string,
  holdingId: string
): Promise<DraftResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const view = await getOwnedPortfolioView(supabase, portfolioId)
  const holding = view?.holdings.find((h) => h.id === holdingId)
  if (!view || !holding) return { ok: false, error: 'Holding not found.' }

  // Company details and headlines exist for listed tickers only. For a coin,
  // gold, or cash, the Finnhub lookup would find an unrelated company.
  const listed = kindOf(holding.assetClass) === 'listed'
  const [profile, news] = listed
    ? await Promise.all([getProfile(holding.ticker), getCompanyNews(holding.ticker)])
    : [null, []]

  const result = await draftThesis({
    ticker: holding.ticker,
    assetClass: holding.assetClass,
    name: holding.name,
    profile,
    quote: view.quotes[holding.key] ?? null,
    holding: {
      quantity: holding.quantity,
      costBasis: holding.costBasis,
      openedAt: holding.openedAt,
    },
    mandate: view.portfolio.mandate,
    weight: holding.weight,
    news,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, draft: result.value }
}

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------

export async function clearMessages(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase.from('messages').delete().eq('portfolio_id', portfolioId)
  if (error) return { ok: false, error: 'Could not clear the conversation. Try again.' }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

/**
 * Saves what became of a change the assistant set up in a chat: confirmed
 * (and recorded, with what was recorded) or cancelled. It goes into that chat
 * as a line of its own, so the card shows the result after a reload and the
 * assistant knows it next time. The change itself was made by its own action.
 */
export async function recordChatOutcome(
  portfolioId: string,
  chatId: string | null,
  actionId: string,
  status: OutcomeStatus,
  summary: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }
  if (!isUuid(actionId) || (status !== 'done' && status !== 'cancelled')) return { ok: false, error: 'Bad request.' }
  if (chatId !== null && chatId !== EARLIER_CHAT && !isUuid(chatId)) return { ok: false, error: 'Bad request.' }

  const row = {
    portfolio_id: portfolioId,
    role: 'assistant',
    content: outcomeMessage(actionId, status, typeof summary === 'string' ? summary : ''),
    created_at: new Date().toISOString(),
  }
  const inChat = chatId && chatId !== EARLIER_CHAT ? { chat_id: chatId } : {}
  let { error } = await supabase.from('messages').insert({ ...row, ...inChat })
  // Before supabase/chats.sql there is one conversation and no chat_id column.
  if (error && missingColumn(error)) ({ error } = await supabase.from('messages').insert(row))
  if (error) return { ok: false, error: 'Could not save that to the chat.' }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

/** Deletes one chat and leaves the portfolio's other chats alone. */
export async function deleteChat(portfolioId: string, chatId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }
  if (chatId !== EARLIER_CHAT && !isUuid(chatId)) return { ok: false, error: 'That chat no longer exists.' }

  const inPortfolio = supabase.from('messages').delete().eq('portfolio_id', portfolioId)
  const { error } = await (chatId === EARLIER_CHAT
    ? inPortfolio.is('chat_id', null)
    : inPortfolio.eq('chat_id', chatId))
  if (error) return { ok: false, error: 'Could not delete the chat. Try again.' }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Sharing and lookups
// ---------------------------------------------------------------------------

/**
 * Makes the portfolio's link public (anyone with it can view, with a fresh
 * token each time) or private again (the link stops working for everyone).
 */
export async function setSharing(portfolioId: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const { data, error } = await supabase
    .from('portfolios')
    .update({ share_token: enabled ? randomUUID() : null })
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    // PGRST204 / 42703: the share_token column doesn't exist yet.
    if (error.code === 'PGRST204' || error.code === '42703') {
      return {
        ok: false,
        error: 'Sharing needs one more database column. Run supabase/setup.sql in the Supabase SQL editor.',
      }
    }
    return { ok: false, error: 'Could not update sharing. Try again.' }
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Sharing with people (needs supabase/sharing.sql)
// ---------------------------------------------------------------------------

const SHARING_NOT_SET_UP =
  'Sharing with people needs one more database script. Run supabase/sharing.sql in the Supabase SQL editor.'

const asMemberRole = (value: unknown): MemberRole | null =>
  value === 'viewer' || value === 'editor' ? value : null

export type LookupResult =
  | { ok: true; code: string; name: string }
  | { ok: false; error: string }

/** Step one of sharing: whose share ID is this? Nothing is shared yet. */
export async function lookupShareCode(input: string): Promise<LookupResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  const code = typeof input === 'string' ? normalizeShareCode(input) : null
  if (!code) {
    return { ok: false, error: 'A share ID looks like FQ-7K3M-9X2P. Check what you typed.' }
  }

  const { data, error } = await supabase.rpc('find_profile_by_code', { p_code: code })
  if (error) {
    return { ok: false, error: sharingNotSetUp(error) ? SHARING_NOT_SET_UP : 'Could not look that ID up. Try again.' }
  }
  const match = ((data ?? []) as { display_name: string; is_self: boolean }[])[0]
  if (!match) return { ok: false, error: `No account has the share ID ${code}. Ask them to check it in their account settings.` }
  if (match.is_self) return { ok: false, error: 'That is your own share ID.' }
  return { ok: true, code, name: match.display_name }
}

/** Step two: send the invite. They have 7 days to accept. */
export async function inviteMember(
  portfolioId: string,
  codeInput: string,
  roleInput: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const code = typeof codeInput === 'string' ? normalizeShareCode(codeInput) : null
  const role = asMemberRole(roleInput)
  if (!code || !role) return { ok: false, error: 'Choose who to share with and what they can do.' }

  const { data, error } = await supabase.rpc('invite_to_portfolio', {
    p_portfolio: portfolioId,
    p_code: code,
    p_role: role,
  })
  if (error) {
    return { ok: false, error: sharingNotSetUp(error) ? SHARING_NOT_SET_UP : 'Could not send the invite. Try again.' }
  }

  const failures: Record<string, string> = {
    not_owner: NOT_FOUND,
    bad_role: 'Choose view-only or editor.',
    not_found: `No account has the share ID ${code}.`,
    self: 'That is your own share ID.',
    already_invited: 'They already have an invite to this portfolio that they haven’t answered yet.',
    already_member: 'They already have access to this portfolio.',
  }
  if (data !== 'ok') return { ok: false, error: failures[String(data)] ?? 'Could not send the invite. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

/** The owner switches someone between view-only and editor. */
export async function setMemberRole(
  portfolioId: string,
  memberId: string,
  roleInput: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const role = asMemberRole(roleInput)
  if (!isUuid(portfolioId) || !isUuid(memberId) || !role) return { ok: false, error: NOT_FOUND }

  const { data, error } = await supabase.rpc('set_member_role', { p_member: memberId, p_role: role })
  if (error || data !== 'ok') return { ok: false, error: 'Could not change their access. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

/** The owner takes someone's access away, or withdraws an unanswered invite. */
export async function removeMember(portfolioId: string, memberId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId) || !isUuid(memberId)) return { ok: false, error: NOT_FOUND }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('id', memberId)
    .eq('portfolio_id', portfolioId)
  if (error) return { ok: false, error: 'Could not remove their access. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export type InviteAnswer = { ok: true; outcome: 'accepted' | 'declined' } | { ok: false; error: string }

/** The invited person accepts or declines. */
export async function respondToInvite(memberId: string, accept: boolean): Promise<InviteAnswer> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(memberId)) return { ok: false, error: 'That invite no longer exists.' }

  const { data, error } = await supabase.rpc('respond_to_invite', {
    p_member: memberId,
    p_accept: accept === true,
  })
  revalidatePath('/dashboard', 'layout')
  if (error) return { ok: false, error: 'Could not answer the invite. Try again.' }
  if (data === 'expired') {
    return { ok: false, error: 'That invite expired after 7 days. Ask them to send a new one.' }
  }
  if (data !== 'accepted' && data !== 'declined') {
    return { ok: false, error: 'That invite no longer exists. It may have been withdrawn.' }
  }
  return { ok: true, outcome: data }
}

/** Someone removes a shared portfolio from their own list. They lose access until invited again. */
export async function leavePortfolio(memberId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(memberId)) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('id', memberId)
    // Their own membership only; the owner removes others with removeMember.
    .eq('user_id', user.id)
  if (error) return { ok: false, error: 'Could not remove it from your list. Try again.' }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}

/** Ticker suggestions for the holding form. */
export async function suggestSymbols(query: string): Promise<SymbolMatch[]> {
  const { user } = await requireUser()
  if (!user || typeof query !== 'string') return []
  return searchSymbols(query.slice(0, 40), 8)
}
