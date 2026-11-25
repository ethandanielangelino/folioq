// Server-only: Yahoo Finance's public chart and search, free and keyless.
//
// Used for:
//   - shares listed outside the US (D05.SI, 0700.HK, BARC.L): live prices,
//     search, and what a ticker is; Finnhub's free plan covers the US only
//   - past prices for any share, fund, or gold and silver futures: by the
//     day, and by the minute or hour for a moment in time (lib/bars.ts says
//     how far back each goes)
//
// These endpoints are public but unofficial, so they may change without
// notice. Every function here answers null or an empty list rather than
// throwing, and callers fall back to FolioQ's saved prices. Both of Yahoo's
// hosts are asked together and the first with an answer wins.

import { fresh } from '@/lib/fresh'
import { barAt, parseYahooBars, yahooIntervals, type BarAt } from '@/lib/bars'
import { yahooSymbol } from '@/lib/venues'
import { parseYahooChart, type DailyClose } from '@/lib/sale-date'

const HOSTS = ['query1', 'query2']
const LIVE_SECONDS = 30

async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'FolioQ price lookup' },
    ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

/** One path, asked of both hosts; the first answer that `ok` accepts wins. Null if neither has one. */
async function ask(path: string, revalidate: number, ok: (body: unknown) => boolean): Promise<unknown> {
  try {
    return await Promise.any(
      HOSTS.map(async (host) => {
        const body = await fetchJson(`https://${host}.finance.yahoo.com${path}`, revalidate)
        if (!ok(body)) throw new Error('no answer')
        return body
      })
    )
  } catch {
    return null
  }
}

const hasChart = (body: unknown) =>
  Array.isArray((body as { chart?: { result?: unknown[] } } | null)?.chart?.result) &&
  ((body as { chart: { result: unknown[] } }).chart.result.length ?? 0) > 0

/** Did Yahoo say outright that it has no such symbol (rather than not answering)? */
async function saysUnknown(path: string): Promise<boolean> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com${path}`, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    return res.status === 404
  } catch {
    return false
  }
}

/**
 * Some markets are quoted in hundredths: London in pence (GBp), Johannesburg
 * in cents (ZAc), Tel Aviv in agorot (ILA). The currency and the factor that
 * turns a quote into whole units of it.
 */
export function wholeUnits(currency: string | null): { code: string; factor: number } | null {
  if (!currency) return null
  if (currency === 'GBp' || currency === 'GBX') return { code: 'GBP', factor: 0.01 }
  if (currency === 'ZAc' || currency === 'ZAC') return { code: 'ZAR', factor: 0.01 }
  if (currency === 'ILA') return { code: 'ILS', factor: 0.01 }
  return { code: currency.toUpperCase(), factor: 1 }
}

// ---------------------------------------------------------------- live

export interface YahooLive {
  /** In whole units of `currency`. */
  price: number
  previousClose: number | null
  high: number | null
  low: number | null
  currency: string
  /** Unix seconds of the last trade. */
  time: number
}

export type YahooLookup = { status: 'ok'; live: YahooLive } | { status: 'unknown' } | { status: 'unavailable' }

/** The latest price of a ticker, in its own currency. */
export async function yahooLive(ticker: string): Promise<YahooLookup> {
  const symbol = yahooSymbol(ticker)
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const body = await fresh(`yahoo:live:${symbol}`, LIVE_SECONDS, () => ask(path, 0, hasChart), (b) => b !== null)
  if (body === null) return (await saysUnknown(path)) ? { status: 'unknown' } : { status: 'unavailable' }
  const meta = ((body as { chart: { result: { meta?: Record<string, unknown> }[] } }).chart.result[0]?.meta ?? {}) as Record<
    string,
    unknown
  >
  const units = wholeUnits(typeof meta.currency === 'string' ? meta.currency : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const price = num(meta.regularMarketPrice)
  if (!units || price === null) return { status: 'unknown' }
  const scale = (v: number | null) => (v === null ? null : v * units.factor)
  return {
    status: 'ok',
    live: {
      price: price * units.factor,
      previousClose: scale(num(meta.previousClose) ?? num(meta.chartPreviousClose)),
      high: scale(num(meta.regularMarketDayHigh)),
      low: scale(num(meta.regularMarketDayLow)),
      currency: units.code,
      time: typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : Math.floor(Date.now() / 1000),
    },
  }
}

// ---------------------------------------------------------------- search and listings

export interface YahooMatch {
  symbol: string
  name: string
  /** Yahoo's quote type: EQUITY, ETF, MUTUALFUND, ... */
  type: string
  industry: string | null
}

/** Tickers matching a name or symbol, on any market. Cached for an hour. */
export async function yahooSearch(query: string): Promise<YahooMatch[]> {
  const q = query.trim()
  if (!q || q.length > 40) return []
  const path = `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`
  const body = await ask(path, 60 * 60, (b) => Array.isArray((b as { quotes?: unknown } | null)?.quotes))
  const quotes = (body as { quotes?: Record<string, unknown>[] } | null)?.quotes ?? []
  return quotes
    .filter((r) => typeof r.symbol === 'string')
    .map((r) => ({
      symbol: String(r.symbol).toUpperCase(),
      name: String(r.longname ?? r.shortname ?? r.symbol),
      type: String(r.quoteType ?? ''),
      industry: typeof r.industry === 'string' ? r.industry : null,
    }))
}

/** What a ticker is on Yahoo: its type, name and industry. Null if it isn’t found. Cached for an hour. */
export async function yahooListing(ticker: string): Promise<YahooMatch | null> {
  const symbol = yahooSymbol(ticker)
  const matches = await yahooSearch(symbol)
  return matches.find((m) => m.symbol === symbol) ?? null
}

/** Yahoo's quote type as Finnhub's security type, so lib/assets.ts can read both the same way. */
export function securityType(match: YahooMatch | null): string {
  if (!match) return ''
  if (match.industry && /REIT/i.test(match.industry)) return 'REIT'
  if (match.type === 'ETF') return 'ETP'
  if (match.type === 'MUTUALFUND') return 'FUND'
  if (match.type === 'EQUITY') return 'Common Stock'
  return match.type
}

// ---------------------------------------------------------------- the past

/**
 * Daily closes around a date, in whole units of their currency. A past day's
 * close doesn't change, so it is kept for a day.
 */
export async function yahooDailyCloses(
  ticker: string,
  from: number,
  to: number,
  live: boolean
): Promise<{ closes: DailyClose[]; currency: string | null }> {
  const symbol = yahooSymbol(ticker)
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`
  const body = await ask(path, live ? 60 : 60 * 60 * 24, (b) => parseYahooChart(b).length > 0)
  if (body === null) return { closes: [], currency: null }
  const { currency } = parseYahooBars(body, 86_400)
  const units = wholeUnits(currency)
  const factor = units?.factor ?? 1
  return {
    closes: parseYahooChart(body).map((c) => ({ date: c.date, close: c.close * factor })),
    currency: units?.code ?? null,
  }
}

export interface YahooMoment extends BarAt {
  /** The currency the bar's prices are in, as whole units. */
  currency: string
}

/**
 * The bar a moment falls in, at the finest interval Yahoo still keeps for it
 * (a minute, five minutes, or an hour), with prices in whole units of their
 * currency. Looks up to four days back, so a moment on a weekend or a night
 * finds the last trade before it. Null if nothing is found.
 */
export async function yahooAt(ticker: string, moment: number, now: number): Promise<YahooMoment | null> {
  const symbol = yahooSymbol(ticker)
  const lookback = 4 * 86_400
  for (const { interval, seconds } of yahooIntervals(moment, now)) {
    // Yahoo returns at most 7 days of one-minute bars per request.
    const from = moment - lookback
    const to = Math.min(moment + seconds, now)
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=${interval}`
    const body = await ask(path, now - moment > 86_400 ? 60 * 60 * 24 : 60, hasChart)
    if (body === null) continue
    const { bars, currency } = parseYahooBars(body, seconds)
    const units = wholeUnits(currency)
    const found = barAt(bars, moment, lookback)
    if (!found || !units) continue
    const f = units.factor
    const b = found.bar
    return {
      inside: found.inside,
      bar: { ...b, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f },
      currency: units.code,
    }
  }
  return null
}
