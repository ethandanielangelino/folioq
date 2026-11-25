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
  /** The moment it happened (ISO), when a time was given. Added by supabase/exchanges.sql. */
  tradedAt: string | null
  /** Money into (+) or out of (−) the portfolio's cash, in `cashCurrency`. */
  cashChange: number
  /** Which cash line the money went into or came out of. */
  cashCurrency: string
  /** Added by the setup script for a holding that already existed. */
  beforeHistory: boolean
  createdBy: string | null
  actorName: string | null
  createdAt: string
  /** When it was last edited, and by whom (supabase/edits.sql). Null if never. */
  editedAt: string | null
  editedName: string | null
  /** 'recalculated' when only its figures were reworked because an earlier entry was edited. */
  editNote: string | null
  /** How it read before its last edit, when it has been edited. */
  before: EntryVersion | null
  /**
   * Cash moved in or out, in the owner's words (supabase/edits.sql): where
   * money added came from, or what money taken out was for.
   */
  purpose: string | null
}

/** The figures an entry had before an edit, as the database kept them. */
export interface EntryVersion {
  quantity: number | null
  price: number | null
  tradeDate: string | null
  tradedAt: string | null
  purpose: string | null
}

/** The longest note kept on cash moved in or out. */
export const PURPOSE_MAX = 200

/** A purpose as typed, tidied: spaces collapsed, trimmed, and cut to PURPOSE_MAX. '' for none. */
export function cleanPurpose(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, PURPOSE_MAX).trim()
}

/** Cash entries that can carry a note: money added (where from) or taken out (what for). */
export function takesPurpose(entry: Pick<HistoryEntry, 'kind' | 'assetClass' | 'beforeHistory'>): boolean {
  if (entry.assetClass !== 'cash') return false
  return entry.kind === 'deposited' || entry.kind === 'withdrawn' || (entry.kind === 'opened' && !entry.beforeHistory)
}

/** "For" money taken out, "From" money added. */
export function purposeWord(kind: HistoryKind): 'For' | 'From' {
  return kind === 'withdrawn' ? 'For' : 'From'
}

/** Entries that can be edited: an opening entry, a purchase, or a sale. The rest have their own controls. */
export const EDITABLE_KINDS: HistoryKind[] = ['opened', 'bought', 'sold']

export function isEditable(entry: HistoryEntry): boolean {
  return EDITABLE_KINDS.includes(entry.kind)
}

/** The last earlier version kept in `revisions` (a list the database appends to on each edit). */
function lastVersion(value: unknown): EntryVersion | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const v = value[value.length - 1] as Record<string, unknown> | null
  if (!v || typeof v !== 'object') return null
  return {
    quantity: num(v.quantity),
    price: num(v.price),
    tradeDate: day(v.trade_date),
    tradedAt: v.traded_at ? String(v.traded_at) : null,
    purpose: v.purpose ? String(v.purpose) : null,
  }
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
    tradedAt: row.traded_at ? String(row.traded_at) : null,
    cashChange: num(row.cash_change) ?? 0,
    cashCurrency: row.cash_currency ? String(row.cash_currency) : 'USD',
    beforeHistory: row.before_history === true,
    createdBy: row.created_by ? String(row.created_by) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    createdAt: String(row.created_at ?? ''),
    editedAt: row.edited_at ? String(row.edited_at) : null,
    editedName: row.edited_name ? String(row.edited_name) : null,
    editNote: row.edit_note ? String(row.edit_note) : null,
    before: lastVersion(row.revisions),
    purpose: cleanPurpose(row.purpose) || null,
  }
}

/** Within a day: the time it happened, when given, else when it was recorded. */
const within = (e: HistoryEntry) => Date.parse(e.tradedAt ?? e.createdAt) || 0

/** Newest first: by the date it happened, then by the time it happened or was recorded. */
export function newestFirst(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort(
    (a, b) => b.tradeDate.localeCompare(a.tradeDate) || within(b) - within(a) || b.createdAt.localeCompare(a.createdAt)
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
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || within(a) - within(b) || a.createdAt.localeCompare(b.createdAt)
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

/** The order things happened in: by date, then the time given (or when recorded). */
function chronological(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || within(a) - within(b) || a.createdAt.localeCompare(b.createdAt)
  )
}

export interface Replay {
  /** What is held after the last entry. */
  quantity: number
  /** Average cost per unit then, US$; null when not known. */
  costBasis: number | null
  /** The date the current run of holding it began (the last time it went from none to some). Null when none is held. */
  since: string | null
  /** True when a sale or withdrawal is for more than was held at the time. */
  oversold: boolean
  /** For each sale: the average cost and the amount held just before it, which its gain is measured from. */
  atSale: Map<string, { costBasis: number | null; quantityBefore: number }>
}

/**
 * One asset's entries replayed in the order they happened, the same way the
 * holding was built up: purchases rework the average cost, sales don't.
 * Used to see what an edit to one entry does to the holding.
 */
export function replayAsset(entries: HistoryEntry[]): Replay {
  let quantity = 0
  let costBasis: number | null = null
  let since: string | null = null
  let oversold = false
  const atSale = new Map<string, { costBasis: number | null; quantityBefore: number }>()
  const tiny = (n: number) => n * 1e-9 + 1e-12

  for (const e of chronological(entries)) {
    switch (e.kind) {
      case 'opened':
      case 'corrected':
        if (quantity <= 0 && e.quantity > 0) since = e.tradeDate
        quantity = e.quantity
        costBasis = e.price
        break
      case 'bought':
        if (quantity <= 0) {
          costBasis = e.price
          since = e.tradeDate
        } else {
          costBasis =
            costBasis === null || e.price === null ? null : (quantity * costBasis + e.quantity * e.price) / (quantity + e.quantity)
        }
        quantity += e.quantity
        break
      case 'deposited':
        if (quantity <= 0) since = e.tradeDate
        quantity += e.quantity
        break
      case 'sold':
      case 'withdrawn':
        if (e.kind === 'sold') atSale.set(e.id, { costBasis, quantityBefore: quantity })
        if (e.quantity > quantity + tiny(quantity)) oversold = true
        quantity = Math.max(0, quantity - e.quantity)
        break
      case 'removed':
        quantity = 0
        costBasis = null
        break
    }
    if (quantity <= tiny(0)) {
      quantity = 0
      since = null
    }
  }
  return { quantity, costBasis, since, oversold, atSale }
}

/**
 * The holding after an edit, from what it is now: the edit's difference,
 * replayed, applied to the current amount and total cost. When the history is
 * complete this is the same as replaying it; when it isn't (changes made
 * before history was kept), it still moves the holding by exactly what the
 * edit changed and nothing else.
 */
export function holdingAfterEdit(
  current: { quantity: number; costBasis: number | null },
  before: Replay,
  after: Replay
): { quantity: number; costBasis: number | null } {
  const quantity = current.quantity + (after.quantity - before.quantity)
  if (quantity <= 1e-12) return { quantity: 0, costBasis: null }
  if (current.costBasis === null || before.costBasis === null || after.costBasis === null) {
    // A cost that wasn't known stays unknown; one that becomes known is taken from the replay.
    return { quantity, costBasis: current.costBasis === null ? null : (after.costBasis ?? null) }
  }
  const total = current.quantity * current.costBasis + (after.quantity * after.costBasis - before.quantity * before.costBasis)
  return { quantity, costBasis: total > 0 ? total / quantity : null }
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
