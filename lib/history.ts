// The history of each holding: what happened, when, at what price, and who
// did it. Pure, so the page, the server, and the tests share it.

import type { AssetClass } from './assets'

/** The price source recorded when a price was typed in because no market source had one. */
export const ENTERED = 'entered'

export type HistoryKind = 'opened' | 'bought' | 'sold' | 'corrected' | 'removed' | 'deposited' | 'withdrawn'

export interface HistoryEntry {
  id: string
  /** priceKey: MSFT, CRYPTO:BTC, METAL:XAU, CASH:USD */
  assetKey: string
  ticker: string
  assetClass: AssetClass
  kind: HistoryKind
  /**
   * opened: amount held; bought / sold: amount traded; corrected: amount
   * afterwards; removed: 0; deposited / withdrawn: the amount of cash.
   */
  quantity: number
  /** US$ per unit: the trade price, or the average cost for opened and corrected. */
  price: number | null
  /** The trading day the price is from, when it was looked up from a date. */
  priceDate: string | null
  /** Where the price came from; null when it was typed in. */
  priceSource: string | null
  /** Average cost before this entry (sold, corrected). */
  costBasis: number | null
  /** Amount held before this entry (corrected, removed). */
  quantityBefore: number | null
  /** The date it happened. */
  tradeDate: string
  /** Money into (+) or out of (−) the portfolio's cash, in `cashCurrency`. */
  cashChange: number
  /** Which cash line the money went into or came out of. */
  cashCurrency: string
  /** Added by the setup script for a holding that already existed. */
  beforeHistory: boolean
  createdBy: string | null
  actorName: string | null
  createdAt: string
}

const KINDS: HistoryKind[] = ['opened', 'bought', 'sold', 'corrected', 'removed', 'deposited', 'withdrawn']

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const day = (value: unknown): string | null => (value ? String(value).slice(0, 10) : null)

/** A database row as an entry. Rows that don't make sense are dropped (null). */
export function toHistoryEntry(row: Record<string, unknown>): HistoryEntry | null {
  const kind = String(row.kind) as HistoryKind
  const quantity = num(row.quantity)
  const tradeDate = day(row.trade_date)
  if (!KINDS.includes(kind) || quantity === null || !tradeDate) return null
  return {
    id: String(row.id),
    assetKey: String(row.asset_key),
    ticker: String(row.ticker),
    assetClass: String(row.asset_class) as AssetClass,
    kind,
    quantity,
    price: num(row.price),
    priceDate: day(row.price_date),
    priceSource: row.price_source ? String(row.price_source) : null,
    costBasis: num(row.cost_basis),
    quantityBefore: num(row.quantity_before),
    tradeDate,
    cashChange: num(row.cash_change) ?? 0,
    cashCurrency: row.cash_currency ? String(row.cash_currency) : 'USD',
    beforeHistory: row.before_history === true,
    createdBy: row.created_by ? String(row.created_by) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    createdAt: String(row.created_at ?? ''),
  }
}

/** Newest first: by the date it happened, then by when it was recorded. */
export function newestFirst(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort(
    (a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.createdAt.localeCompare(a.createdAt)
  )
}

/** One asset's history, newest first. */
export function historyFor(entries: HistoryEntry[], assetKey: string): HistoryEntry[] {
  return newestFirst(entries.filter((e) => e.assetKey === assetKey))
}

/**
 * A cash line's history: its own deposits, withdrawals and corrections, and
 * the money trades moved in and out of it (sale proceeds, purchases paid from it).
 */
export function cashHistoryFor(entries: HistoryEntry[], currency: string): HistoryEntry[] {
  const key = `CASH:${currency}`
  return newestFirst(
    entries.filter((e) => e.assetKey === key || (e.cashChange !== 0 && e.cashCurrency === currency && e.assetKey !== key))
  )
}

export interface PositionStep {
  /** From this date on, until the next step. */
  date: string
  quantity: number
  /** Average cost per unit in US$, or null when not known (and for cash). */
  costBasis: number | null
}

/**
 * For each asset, how much was held, and at what average cost, from each date
 * on, replayed from its history in the order things happened. Cash lines also
 * move with the money trades put in or took out.
 */
export function positionTimeline(entries: HistoryEntry[]): Map<string, PositionStep[]> {
  const ordered = [...entries].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAt.localeCompare(b.createdAt)
  )
  const state = new Map<string, { quantity: number; costBasis: number | null }>()
  const timeline = new Map<string, PositionStep[]>()

  const record = (key: string, date: string) => {
    const now = state.get(key)!
    const steps = timeline.get(key) ?? []
    const step = { date, quantity: now.quantity, costBasis: now.costBasis }
    if (steps.length > 0 && steps[steps.length - 1].date === date) steps[steps.length - 1] = step
    else steps.push(step)
    timeline.set(key, steps)
  }

  for (const e of ordered) {
    const now = state.get(e.assetKey) ?? { quantity: 0, costBasis: null }
    switch (e.kind) {
      case 'opened':
      case 'corrected':
        now.quantity = e.quantity
        now.costBasis = e.price
        break
      case 'bought': {
        const total = now.quantity + e.quantity
        if (now.quantity <= 0) now.costBasis = e.price
        else if (now.costBasis === null || e.price === null) now.costBasis = null
        else now.costBasis = (now.quantity * now.costBasis + e.quantity * e.price) / total
        now.quantity = total
        break
      }
      case 'sold':
      case 'withdrawn':
        now.quantity = Math.max(0, now.quantity - e.quantity)
        break
      case 'deposited':
        now.quantity += e.quantity
        break
      case 'removed':
        now.quantity = 0
        now.costBasis = null
        break
    }
    state.set(e.assetKey, now)
    record(e.assetKey, e.tradeDate)

    // The money a trade moved, on the cash line it went through.
    if (e.cashChange !== 0 && e.assetKey !== `CASH:${e.cashCurrency}`) {
      const cashKey = `CASH:${e.cashCurrency}`
      const cash = state.get(cashKey) ?? { quantity: 0, costBasis: null }
      cash.quantity = Math.max(0, cash.quantity + e.cashChange)
      state.set(cashKey, cash)
      record(cashKey, e.tradeDate)
    }
  }
  return timeline
}

/** What was held on a date, from a timeline; null if the asset wasn't on record yet. */
export function positionOn(steps: PositionStep[] | undefined, date: string): PositionStep | null {
  if (!steps) return null
  let found: PositionStep | null = null
  for (const step of steps) {
    if (step.date > date) break
    found = step
  }
  return found
}

/** The gain on a sale, against the average cost at the time. Null when the cost wasn't known. */
export function saleGain(entry: HistoryEntry): number | null {
  if (entry.kind !== 'sold' || entry.price === null || entry.costBasis === null) return null
  return entry.quantity * (entry.price - entry.costBasis)
}

/** The history table is missing until supabase/history.sql has been run. */
export function historyNotSetUp(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /holding_history/.test(error.message ?? '')
  )
}
