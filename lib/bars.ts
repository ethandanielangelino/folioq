// Prices at a moment in time: each source's candles read into one shape, and
// the candle for a given moment picked out. Pure: no fetching here, so it can
// be tested on its own (lib/bars.test.mjs).
//
// A candle (bar) covers a stretch of time, a minute, an hour or a day, and
// gives the first, highest, lowest and last price traded in it. The price at a
// moment is the last price of the bar that moment falls in. When nothing
// traded then (a market shut for the night, a coin nobody traded that
// minute), it is the last price before, and the answer says so.

export interface Bar {
  /** Unix seconds when the bar starts. */
  start: number
  /** How long it lasts, in seconds. */
  seconds: number
  open: number
  high: number
  low: number
  close: number
}

export interface BarAt {
  bar: Bar
  /** False when the moment falls after the bar ended: nothing traded at the moment itself. */
  inside: boolean
}

const positive = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

const seconds = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** A bar from its parts, or null if a price is missing. */
function bar(start: number | null, length: number, o: unknown, h: unknown, l: unknown, c: unknown): Bar | null {
  const close = positive(c)
  if (start === null || close === null) return null
  const open = positive(o) ?? close
  const high = positive(h) ?? Math.max(open, close)
  const low = positive(l) ?? Math.min(open, close)
  return { start, seconds: length, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close }
}

function rows<T>(list: unknown, read: (row: T) => Bar | null): Bar[] {
  if (!Array.isArray(list)) return []
  const out: Bar[] = []
  for (const row of list) {
    const b = read(row as T)
    if (b) out.push(b)
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * The bar a moment falls in, or the last one before it within `lookback`
 * seconds. Bars that start after the moment are ignored: some sources add the
 * bar in progress now to any answer, whatever was asked for.
 */
export function barAt(bars: Bar[], moment: number, lookback: number): BarAt | null {
  let best: Bar | null = null
  for (const b of bars) {
    if (b.start > moment || b.start < moment - lookback - b.seconds) continue
    if (!best || b.start > best.start) best = b
  }
  if (!best) return null
  return { bar: best, inside: moment < best.start + best.seconds }
}

/** The day a daily bar belongs to: the date at its middle, so bars that start at 00:00 in another time zone land right. */
export function barDate(b: Bar): string {
  return new Date((b.start + b.seconds / 2) * 1000).toISOString().slice(0, 10)
}

/** Unix seconds from an ISO timestamp, or null if it isn't one. */
export function toSeconds(iso: unknown): number | null {
  if (typeof iso !== 'string' || !iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

// ---------------------------------------------------------------- how fine a price can be

/**
 * Yahoo Finance keeps bars by the minute for 30 days, by 5 minutes for 60,
 * and by the hour for about two years. Asked in that order from finest; older
 * than that, only the day's close is left (null).
 */
export function yahooIntervals(moment: number, now: number): { interval: string; seconds: number }[] {
  const days = (now - moment) / 86_400
  const out: { interval: string; seconds: number }[] = []
  if (days < 29) out.push({ interval: '1m', seconds: 60 })
  if (days < 59) out.push({ interval: '5m', seconds: 300 })
  if (days < 725) out.push({ interval: '60m', seconds: 3600 })
  return out
}

// ---------------------------------------------------------------- reading each source

/** Yahoo Finance's chart, any interval, and the currency it is priced in. */
export function parseYahooBars(body: unknown, length: number): { bars: Bar[]; currency: string | null } {
  const result = (body as { chart?: { result?: unknown[] } } | null)?.chart?.result?.[0] as
    | {
        meta?: { currency?: unknown }
        timestamp?: unknown[]
        indicators?: { quote?: { open?: unknown[]; high?: unknown[]; low?: unknown[]; close?: unknown[] }[] }
      }
    | undefined
  const stamps = result?.timestamp
  const q = result?.indicators?.quote?.[0]
  const currency = typeof result?.meta?.currency === 'string' ? result.meta.currency : null
  if (!Array.isArray(stamps) || !q || !Array.isArray(q.close)) return { bars: [], currency }
  const out: Bar[] = []
  stamps.forEach((stamp, i) => {
    const b = bar(seconds(stamp), length, q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i])
    if (b) out.push(b)
  })
  return { bars: out.sort((a, b) => a.start - b.start), currency }
}

/** Coinbase Exchange: [time, low, high, open, close, volume]. */
export const parseCoinbase = (body: unknown, length: number) =>
  rows<unknown[]>(body, (r) => (Array.isArray(r) ? bar(seconds(r[0]), length, r[3], r[2], r[1], r[4]) : null))

/** Kraken OHLC: [time, open, high, low, close, ...] under the pair's own name. */
export function parseKrakenOhlc(body: unknown, length: number): Bar[] {
  const result = (body as { result?: Record<string, unknown> } | null)?.result
  const list = result ? Object.entries(result).find(([name]) => name !== 'last')?.[1] : null
  return rows<unknown[]>(list, (r) => (Array.isArray(r) ? bar(seconds(r[0]), length, r[1], r[2], r[3], r[4]) : null))
}

/**
 * Kraken's individual trades, [price, volume, time, ...], gathered into
 * one-minute bars. Kraken keeps every trade, so this reaches back for years.
 */
export function parseKrakenTrades(body: unknown): Bar[] {
  const result = (body as { result?: Record<string, unknown> } | null)?.result
  const list = result ? Object.entries(result).find(([name]) => name !== 'last')?.[1] : null
  if (!Array.isArray(list)) return []
  const byMinute = new Map<number, Bar>()
  for (const row of list) {
    if (!Array.isArray(row)) continue
    const price = positive(row[0])
    const time = seconds(row[2])
    if (price === null || time === null) continue
    const start = Math.floor(time / 60) * 60
    const seen = byMinute.get(start)
    if (!seen) byMinute.set(start, { start, seconds: 60, open: price, high: price, low: price, close: price })
    else {
      seen.high = Math.max(seen.high, price)
      seen.low = Math.min(seen.low, price)
      seen.close = price
    }
  }
  return [...byMinute.values()].sort((a, b) => a.start - b.start)
}

/** Binance, MEXC, OKX, Bybit, Bitget, Gemini: [time in ms, open, high, low, close, ...]. */
export const parseMsOhlc = (body: unknown, length: number) =>
  rows<unknown[]>(body, (r) => {
    const ms = Array.isArray(r) ? seconds(r[0]) : null
    return Array.isArray(r) && ms !== null ? bar(Math.floor(ms / 1000), length, r[1], r[2], r[3], r[4]) : null
  })

/** KuCoin: [time in s, open, close, high, low, ...]. */
export const parseKucoin = (body: unknown, length: number) =>
  rows<unknown[]>((body as { data?: unknown } | null)?.data, (r) =>
    Array.isArray(r) ? bar(seconds(r[0]), length, r[1], r[3], r[4], r[2]) : null
  )

/** Gate: [time in s, quote volume, close, high, low, open, ...]. */
export const parseGate = (body: unknown, length: number) =>
  rows<unknown[]>(body, (r) => (Array.isArray(r) ? bar(seconds(r[0]), length, r[5], r[3], r[4], r[2]) : null))

/** Bitfinex: [time in ms, open, close, high, low, volume]. */
export const parseBitfinex = (body: unknown, length: number) =>
  rows<unknown[]>(body, (r) => {
    const ms = Array.isArray(r) ? seconds(r[0]) : null
    return Array.isArray(r) && ms !== null ? bar(Math.floor(ms / 1000), length, r[1], r[3], r[4], r[2]) : null
  })

/** Bitstamp: { data: { ohlc: [{ timestamp, open, high, low, close }] } }. */
export const parseBitstamp = (body: unknown, length: number) =>
  rows<Record<string, unknown>>((body as { data?: { ohlc?: unknown } } | null)?.data?.ohlc, (r) =>
    bar(seconds(r?.timestamp), length, r?.open, r?.high, r?.low, r?.close)
  )

/** Crypto.com: { result: { data: [{ t (ms), o, h, l, c }] } }. */
export const parseCryptoCom = (body: unknown, length: number) =>
  rows<Record<string, unknown>>((body as { result?: { data?: unknown } } | null)?.result?.data, (r) => {
    const ms = seconds(r?.t)
    return ms === null ? null : bar(Math.floor(ms / 1000), length, r?.o, r?.h, r?.l, r?.c)
  })

/** HTX: { data: [{ id (s), open, close, low, high }] }. */
export const parseHtx = (body: unknown, length: number) =>
  rows<Record<string, unknown>>((body as { data?: unknown } | null)?.data, (r) =>
    bar(seconds(r?.id), length, r?.open, r?.high, r?.low, r?.close)
  )

/** Upbit and Bithumb: [{ candle_date_time_utc, opening_price, high_price, low_price, trade_price }]. */
export const parseUpbit = (body: unknown, length: number) =>
  rows<Record<string, unknown>>(body, (r) =>
    bar(
      typeof r?.candle_date_time_utc === 'string' ? toSeconds(`${r.candle_date_time_utc}Z`) : null,
      length,
      r?.opening_price,
      r?.high_price,
      r?.low_price,
      r?.trade_price
    )
  )

/** Indodax: [{ Time (s), Open, High, Low, Close }]. */
export const parseIndodax = (body: unknown, length: number) =>
  rows<Record<string, unknown>>(body, (r) => bar(seconds(r?.Time), length, r?.Open, r?.High, r?.Low, r?.Close))

/** Independent Reserve's hourly summaries. Hours with no trades carry no price and are skipped. */
export const parseIndependentReserve = (body: unknown) =>
  rows<Record<string, unknown>>((body as { HistorySummaryItems?: unknown } | null)?.HistorySummaryItems, (r) =>
    Number(r?.NumberOfTrades) > 0
      ? bar(
          toSeconds(r?.StartTimestampUtc),
          3600,
          r?.OpeningSecondaryCurrencyPrice,
          r?.HighestSecondaryCurrencyPrice,
          r?.LowestSecondaryCurrencyPrice,
          r?.ClosingSecondaryCurrencyPrice
        )
      : null
  )
