// Server-only wrapper around the Finnhub REST API.
// Every function returns null (or an empty list) instead of throwing, so a
// market-data hiccup degrades the page rather than breaking it.

import type { PriceQuote } from '@/lib/portfolio'

const BASE_URL = 'https://finnhub.io/api/v1'

export const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,12}$/

export function normalizeSymbol(input: string): string | null {
  const symbol = input.trim().toUpperCase()
  return SYMBOL_PATTERN.test(symbol) ? symbol : null
}

type FetchResult<T> = { status: 'ok'; data: T } | { status: 'error' }

async function finnhub<T>(
  path: string,
  params: Record<string, string>,
  revalidateSeconds: number
): Promise<FetchResult<T>> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return { status: 'error' }

  const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`
  try {
    const res = await fetch(url, {
      headers: { 'X-Finnhub-Token': key },
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { status: 'error' }
    return { status: 'ok', data: (await res.json()) as T }
  } catch {
    return { status: 'error' }
  }
}

interface RawQuote {
  c: number
  d: number | null
  dp: number | null
  h: number
  l: number
  o: number
  pc: number
  t: number
}

export interface Quote extends PriceQuote {
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
  /** Unix seconds of the last trade */
  timestamp: number
}

export type QuoteLookup =
  | { status: 'ok'; quote: Quote }
  /** Finnhub answered, but it has no price for this symbol. */
  | { status: 'unknown' }
  /** Finnhub could not be reached, or the request was rate limited. */
  | { status: 'unavailable' }

export async function lookupQuote(symbol: string): Promise<QuoteLookup> {
  const result = await finnhub<RawQuote>('/quote', { symbol }, 60)
  if (result.status === 'error') return { status: 'unavailable' }

  const raw = result.data
  if (!raw || typeof raw.c !== 'number' || raw.c <= 0) return { status: 'unknown' }

  return {
    status: 'ok',
    quote: {
      price: raw.c,
      change: raw.d ?? 0,
      changePercent: (raw.dp ?? 0) / 100,
      high: raw.h,
      low: raw.l,
      open: raw.o,
      previousClose: raw.pc,
      timestamp: raw.t,
    },
  }
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const result = await lookupQuote(symbol)
  return result.status === 'ok' ? result.quote : null
}

/** Fetches quotes for many symbols, a few at a time to stay under rate limits. */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote | null>> {
  const unique = [...new Set(symbols)]
  const quotes: Record<string, Quote | null> = {}
  const concurrency = 6

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency)
    const results = await Promise.all(batch.map((s) => getQuote(s)))
    batch.forEach((symbol, index) => {
      quotes[symbol] = results[index]
    })
  }

  return quotes
}

export interface CompanyProfile {
  name: string
  ticker: string
  exchange: string | null
  industry: string | null
  country: string | null
  currency: string | null
  ipo: string | null
  /** In millions of the listing currency */
  marketCap: number | null
  website: string | null
}

interface RawProfile {
  name?: string
  ticker?: string
  exchange?: string
  finnhubIndustry?: string
  country?: string
  currency?: string
  ipo?: string
  marketCapitalization?: number
  weburl?: string
}

/** Company details. Null for symbols Finnhub has no profile for (many ETFs). */
export async function getProfile(symbol: string): Promise<CompanyProfile | null> {
  const result = await finnhub<RawProfile>('/stock/profile2', { symbol }, 60 * 60 * 24)
  if (result.status === 'error' || !result.data?.name) return null

  const raw = result.data
  return {
    name: raw.name!,
    ticker: raw.ticker ?? symbol,
    exchange: raw.exchange || null,
    industry: raw.finnhubIndustry || null,
    country: raw.country || null,
    currency: raw.currency || null,
    ipo: raw.ipo || null,
    marketCap: typeof raw.marketCapitalization === 'number' ? raw.marketCapitalization : null,
    website: safeHttpUrl(raw.weburl),
  }
}

export interface SymbolMatch {
  symbol: string
  description: string
  type: string
}

interface RawSearch {
  result?: { symbol: string; displaySymbol: string; description: string; type: string }[]
}

/** Searches US-listed symbols by ticker or company name. */
export async function searchSymbols(query: string, limit = 10): Promise<SymbolMatch[]> {
  const q = query.trim()
  if (!q || q.length > 40) return []

  const result = await finnhub<RawSearch>('/search', { q, exchange: 'US' }, 60 * 60)
  if (result.status === 'error') return []

  return (result.data.result ?? [])
    .filter((r) => SYMBOL_PATTERN.test(r.symbol))
    .slice(0, limit)
    .map((r) => ({ symbol: r.symbol, description: r.description, type: r.type }))
}

export interface NewsItem {
  id: number
  headline: string
  source: string
  summary: string
  url: string
  /** Unix seconds */
  datetime: number
}

interface RawNews {
  id: number
  headline: string
  source: string
  summary: string
  url: string
  datetime: number
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getCompanyNews(symbol: string, limit = 6): Promise<NewsItem[]> {
  const to = new Date()
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
  const result = await finnhub<RawNews[]>(
    '/company-news',
    { symbol, from: isoDay(from), to: isoDay(to) },
    60 * 15
  )
  if (result.status === 'error' || !Array.isArray(result.data)) return []

  const items: NewsItem[] = []
  for (const raw of result.data) {
    const url = safeHttpUrl(raw.url)
    if (!url || !raw.headline) continue
    items.push({
      id: raw.id,
      headline: raw.headline,
      source: raw.source,
      summary: raw.summary,
      url,
      datetime: raw.datetime,
    })
    if (items.length >= limit) break
  }
  return items
}

/** Only pass through http(s) links from third-party data. */
function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
