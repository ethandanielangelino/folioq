// Picking the price a sale is recorded at, from the date it happened.
// Pure: no fetching here, so it can be tested on its own.

export interface DailyClose {
  /** YYYY-MM-DD, the trading day the close belongs to. */
  date: string
  close: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Markets shut for a weekend or a holiday, never longer, so a close older than this is a gap in the data. */
export const MAX_DAYS_BACK = 6

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** "2026-11-14" moved by a number of days. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Unix seconds at midnight UTC on that date. */
export function utcSeconds(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 1000
}

/**
 * Why a sale can't be on this date, or null if it can. A sale can't be in the
 * future, or before the holding was bought.
 */
export function saleDateProblem(date: unknown, { openedAt, today }: { openedAt: string; today: string }): string | null {
  if (!isIsoDate(date)) return 'Choose the date you sold on.'
  if (date > today) return 'The sale date can’t be in the future.'
  if (date < openedAt.slice(0, 10)) return 'The sale date can’t be before you bought it.'
  return null
}

/**
 * The close for that date, or for the last trading day before it when the
 * market was shut (a weekend or holiday). Null if there is none close enough.
 */
export function closeOnOrBefore(points: DailyClose[], date: string): DailyClose | null {
  const earliest = shiftDate(date, -MAX_DAYS_BACK)
  let best: DailyClose | null = null
  for (const point of points) {
    if (!(point.close > 0) || point.date > date || point.date < earliest) continue
    if (!best || point.date > best.date) best = point
  }
  return best
}

// ---------------------------------------------------------------- reading each source's answer

const positive = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Yahoo Finance's daily chart. Each timestamp is the session's opening time,
 * so it is moved into the exchange's own time zone to get the trading day.
 */
export function parseYahooChart(body: unknown): DailyClose[] {
  const result = (body as { chart?: { result?: unknown[] } } | null)?.chart?.result?.[0] as
    | {
        meta?: { gmtoffset?: unknown }
        timestamp?: unknown[]
        indicators?: { quote?: { close?: unknown[] }[] }
      }
    | undefined
  const stamps = result?.timestamp
  const closes = result?.indicators?.quote?.[0]?.close
  if (!Array.isArray(stamps) || !Array.isArray(closes)) return []
  const offset = typeof result?.meta?.gmtoffset === 'number' ? result.meta.gmtoffset : 0
  const points: DailyClose[] = []
  stamps.forEach((stamp, i) => {
    const close = positive(closes[i])
    if (typeof stamp !== 'number' || close === null) return
    points.push({ date: new Date((stamp + offset) * 1000).toISOString().slice(0, 10), close })
  })
  return points
}

/** Coinbase Exchange daily candles: [time, low, high, open, close, volume], one per UTC day. */
export function parseCoinbaseCandles(body: unknown): DailyClose[] {
  if (!Array.isArray(body)) return []
  const points: DailyClose[] = []
  for (const row of body) {
    if (!Array.isArray(row) || typeof row[0] !== 'number') continue
    const close = positive(row[4])
    if (close !== null) points.push({ date: new Date(row[0] * 1000).toISOString().slice(0, 10), close })
  }
  return points
}

/** Kraken daily OHLC: [time, open, high, low, close, vwap, volume, count], under the pair's own name. */
export function parseKrakenOhlc(body: unknown): DailyClose[] {
  const result = (body as { result?: Record<string, unknown> } | null)?.result
  if (!result) return []
  const rows = Object.entries(result).find(([name]) => name !== 'last')?.[1]
  if (!Array.isArray(rows)) return []
  const points: DailyClose[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'number') continue
    const close = positive(row[4])
    if (close !== null) points.push({ date: new Date(row[0] * 1000).toISOString().slice(0, 10), close })
  }
  return points
}
