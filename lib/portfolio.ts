// Pure portfolio maths. No imports, so it runs under plain `node --test` too.
//
// A holding is a position you enter directly: ticker, quantity, and the
// average cost per share. Everything else is derived from those and a price.

export interface HoldingInput {
  id: string
  ticker: string
  quantity: number
  /** Average cost per share. Null when the owner didn't record one. */
  costBasis: number | null
  /** ISO date the position was opened, YYYY-MM-DD */
  openedAt: string
}

export interface PriceQuote {
  /** Latest price */
  price: number
  /** Change since the previous close, per share */
  change: number
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
      const quote = quotes[h.ticker] ?? null
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
        dayChange: quote ? h.quantity * quote.change : null,
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

/**
 * Value of today's holdings on each past day that has stored closing prices.
 * A holding counts from the day it was opened. A day is skipped unless every
 * holding open that day has a close, so the line never shows a partial total.
 *
 * This uses current quantities throughout: it answers "what were these
 * positions worth", not "what did the account hold back then".
 */
export function buildHistory(holdings: HoldingInput[], closes: DailyClose[]): HistoryPoint[] {
  const open = holdings.filter((h) => h.quantity > 0)
  if (open.length === 0) return []

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
    const active = open.filter((h) => h.openedAt <= date)
    if (active.length === 0) continue
    if (active.some((h) => !day.has(h.ticker))) continue

    points.push({
      date,
      marketValue: active.reduce((sum, h) => sum + h.quantity * day.get(h.ticker)!, 0),
      costBasis: active.reduce((sum, h) => sum + h.quantity * (h.costBasis ?? 0), 0),
    })
  }
  return points
}
