// Pure portfolio maths. No imports, so it runs under plain `node --test` too.
//
// A holding is a position you enter directly: ticker, quantity, and the
// average cost per share. Everything else is derived from those and a price.

export interface HoldingInput {
  id: string
  ticker: string
  /**
   * Where this holding's prices are found, in quotes and in stored closes.
   * Defaults to the ticker. Set when the ticker alone is ambiguous: the coin
   * BTC and a fund whose ticker is BTC are different things.
   */
  key?: string
  quantity: number
  /** Average cost per share. Null when the owner didn't record one. */
  costBasis: number | null
  /** ISO date the position was opened, YYYY-MM-DD */
  openedAt: string
}

export interface PriceQuote {
  /** Latest price */
  price: number
  /**
   * Change since the previous close, per unit. Null when there is nothing to
   * compare with (no earlier price on record yet).
   */
  change: number | null
}

export interface ValuedHolding extends HoldingInput {
  /** null when no quote is available */
  price: number | null
  marketValue: number
  /** Total paid for the position; null when no cost was recorded */
  cost: number | null
  dayChange: number | null
  /** Needs both a price and a cost */
  gain: number | null
  gainPct: number | null
  /** Share of the portfolio's market value, 0..1 */
  weight: number
}

export interface PortfolioTotals {
  marketValue: number
  /** Sum of recorded costs (holdings without a cost are left out) */
  costBasis: number
  /** Gain across holdings that have both a price and a cost */
  gain: number
  gainPct: number | null
  dayChange: number
  dayChangePct: number | null
  /** Tickers held for which no quote was available (valued at cost) */
  unpriced: string[]
  /** Tickers held with no cost on record (left out of gain) */
  uncosted: string[]
}

/** Prices holdings and computes weights. Largest holding first. */
export function valueHoldings<T extends HoldingInput>(
  holdings: T[],
  quotes: Record<string, PriceQuote | null | undefined>
): (T & ValuedHolding)[] {
  const valued = holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const quote = quotes[h.key ?? h.ticker] ?? null
      const price = quote ? quote.price : null
      const cost = h.costBasis === null ? null : h.quantity * h.costBasis
      // Without a quote, carry the holding at cost so totals stay sensible.
      const marketValue = price !== null ? h.quantity * price : (cost ?? 0)
      const gain = price !== null && cost !== null ? marketValue - cost : null
      return {
        ...h,
        price,
        marketValue,
        cost,
        dayChange: quote && quote.change !== null ? h.quantity * quote.change : null,
        gain,
        gainPct: gain !== null && cost !== null && cost > 0 ? gain / cost : null,
        weight: 0,
      }
    })

  const total = valued.reduce((sum, h) => sum + h.marketValue, 0)
  for (const h of valued) h.weight = total > 0 ? h.marketValue / total : 0

  return valued.sort((a, b) => b.marketValue - a.marketValue || a.ticker.localeCompare(b.ticker))
}

export function computeTotals(valued: ValuedHolding[]): PortfolioTotals {
  const marketValue = valued.reduce((sum, h) => sum + h.marketValue, 0)
  const costBasis = valued.reduce((sum, h) => sum + (h.cost ?? 0), 0)
  const dayChange = valued.reduce((sum, h) => sum + (h.dayChange ?? 0), 0)

  // Gain only counts holdings where both sides of the subtraction are real.
  const measurable = valued.filter((h) => h.gain !== null)
  const gain = measurable.reduce((sum, h) => sum + (h.gain ?? 0), 0)
  const measuredCost = measurable.reduce((sum, h) => sum + (h.cost ?? 0), 0)
  const previousValue = marketValue - dayChange

  return {
    marketValue,
    costBasis,
    gain,
    gainPct: measuredCost > 0 ? gain / measuredCost : null,
    dayChange,
    dayChangePct: previousValue > 0 ? dayChange / previousValue : null,
    unpriced: valued.filter((h) => h.price === null).map((h) => h.ticker),
    uncosted: valued.filter((h) => h.cost === null).map((h) => h.ticker),
  }
}

export interface DailyClose {
  ticker: string
  /** YYYY-MM-DD */
  date: string
  close: number
}

export interface HistoryPoint {
  date: string
  marketValue: number
  costBasis: number
}

/** What was held of an asset on a past day, replayed from its history. */
export interface PositionLookup {
  /** Every asset with recorded history, including ones no longer held. */
  keys: string[]
  /** What was held on that date, or null if the asset wasn't on record yet. */
  on: (key: string, date: string) => { quantity: number; costBasis: number | null } | null
}

/**
 * Value on each past day that has stored closing prices. A day is skipped
 * unless everything held that day has a close, so the line never shows a
 * partial total. US dollars are always worth one dollar.
 *
 * With `positions` (the holding history), each day counts what was actually
 * held then: buys, sales, deposits and withdrawals change the line on the day
 * they happened, and assets sold out since still count while they were held.
 * Without it (or for an asset with no history), a holding counts at today's
 * amount from the day it was opened.
 */
export function buildHistory(
  holdings: HoldingInput[],
  closes: DailyClose[],
  positions?: PositionLookup
): HistoryPoint[] {
  const current = new Map(holdings.filter((h) => h.quantity > 0).map((h) => [h.key ?? h.ticker, h]))
  const replayed = new Set(positions?.keys ?? [])
  const keys = new Set([...current.keys(), ...replayed])
  if (keys.size === 0) return []

  const byDate = new Map<string, Map<string, number>>()
  for (const c of closes) {
    let day = byDate.get(c.date)
    if (!day) {
      day = new Map()
      byDate.set(c.date, day)
    }
    day.set(c.ticker, c.close)
  }

  const points: HistoryPoint[] = []
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!
    let marketValue = 0
    let costBasis = 0
    let held = false
    let complete = true
    for (const key of keys) {
      let quantity: number
      let unitCost: number | null
      if (positions && replayed.has(key)) {
        const position = positions.on(key, date)
        if (!position || position.quantity <= 0) continue
        quantity = position.quantity
        unitCost = position.costBasis
      } else {
        const h = current.get(key)
        if (!h || h.openedAt > date) continue
        quantity = h.quantity
        unitCost = h.costBasis
      }
      const close = key === 'CASH:USD' ? 1 : day.get(key)
      if (close === undefined) {
        complete = false
        break
      }
      held = true
      marketValue += quantity * close
      // Cash has no cost: it is simply money.
      if (!key.startsWith('CASH:')) costBasis += quantity * (unitCost ?? 0)
    }
    if (held && complete) points.push({ date, marketValue, costBasis })
  }
  return points
}

export interface SaleOutcome {
  /** Money received: quantity sold times the sale price. */
  proceeds: number
  /** What is left of the holding afterwards. 0 when it is sold in full. */
  remaining: number
  sellsAll: boolean
  /** Profit or loss on the part sold, against the average cost. Null when no cost was recorded. */
  realizedGain: number | null
}

/**
 * What selling part or all of a holding does. Quantities within a hair of the
 * whole count as selling everything, so 0.1 + 0.2 style rounding never leaves
 * a speck behind.
 */
export function planSale(
  holding: { quantity: number; costBasis: number | null },
  quantity: number,
  price: number
): SaleOutcome {
  const sold = Math.min(quantity, holding.quantity)
  const remaining = holding.quantity - sold
  const sellsAll = remaining <= holding.quantity * 1e-9
  return {
    proceeds: sold * price,
    remaining: sellsAll ? 0 : remaining,
    sellsAll,
    realizedGain: holding.costBasis === null ? null : sold * (price - holding.costBasis),
  }
}

export interface BuyOutcome {
  /** Money paid: quantity bought times the price. */
  cost: number
  /** The holding's quantity afterwards. */
  quantity: number
  /**
   * The new average cost per unit: the old cost and the new one, weighted by
   * quantity. Null when the old cost isn't on record, since the average
   * can't be known without it.
   */
  costBasis: number | null
}

/**
 * How many shares, coins, or ounces an amount of money buys: `amount` in a
 * currency worth `perUsd` units to the US dollar, at `priceUsd` each. Kept to
 * eight decimal places, the finest a coin is counted in. Null if it can't be
 * worked out or rounds to nothing.
 */
export function unitsForMoney(amount: number, perUsd: number, priceUsd: number): number | null {
  if (!(amount > 0) || !(perUsd > 0) || !(priceUsd > 0)) return null
  if (![amount, perUsd, priceUsd].every(Number.isFinite)) return null
  const units = Math.round((amount / perUsd / priceUsd) * 1e8) / 1e8
  return units > 0 ? units : null
}

/** Buying more of a holding. */
export function planBuy(
  holding: { quantity: number; costBasis: number | null },
  quantity: number,
  price: number
): BuyOutcome {
  const total = holding.quantity + quantity
  return {
    cost: quantity * price,
    quantity: total,
    costBasis:
      holding.costBasis === null ? null : (holding.quantity * holding.costBasis + quantity * price) / total,
  }
}

/**
 * Whether there is enough cash to pay. A fraction of a cent short counts as
 * enough, so paying with exactly what is there never fails on rounding.
 */
export function cashCovers(available: number, cost: number): boolean {
  return available - cost >= -0.005
}
