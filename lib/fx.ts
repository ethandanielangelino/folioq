// Server-only: exchange rates against the US dollar.
//
// Two kinds of source, both free and neither needing a key:
//   live       quoted through the day (fxratesapi.com, then Coinbase's public
//              rates if that is unreachable)
//   reference  the European Central Bank's official daily rate, via Frankfurter
//
// A live rate is only used when it sits close to the reference rate (see
// pickRate in lib/currency.ts), so a misbehaving feed can't put a wild number
// on someone's portfolio. If no live source answers, the reference rate is
// used and the page says so.

import { pickRate } from '@/lib/currency'
import { fresh } from '@/lib/fresh'

type Table = Record<string, number>

/** The site a rate came from, so pages can name it and link to it. */
export interface Provider {
  name: string
  url: string
}

const FXRATES: Provider = { name: 'fxratesapi.com', url: 'https://fxratesapi.com' }
const COINBASE: Provider = { name: 'Coinbase', url: 'https://www.coinbase.com/converter' }
const ECB: Provider = {
  name: 'the European Central Bank (via frankfurter.dev)',
  url: 'https://frankfurter.dev',
}

export interface Rate {
  rate: number
  source: 'live' | 'reference'
  /** When the figure is from: an ISO timestamp for live, a date for reference. */
  asOf: string
  provider: Provider
}

/** `revalidateSeconds` of 0 means live: fetched uncached and reused for a minute (see lib/fresh.ts). */
async function getJson(url: string, revalidateSeconds: number): Promise<unknown> {
  if (revalidateSeconds === 0) {
    return fresh(`fx:${url}`, LIVE_SECONDS, () => fetchJson(url, 0), (body) => body !== null)
  }
  return fetchJson(url, revalidateSeconds)
}

const LIVE_SECONDS = 60

async function fetchJson(url: string, revalidateSeconds: number): Promise<unknown> {
  try {
    const res = await fetch(url, {
      ...(revalidateSeconds > 0 ? { next: { revalidate: revalidateSeconds } } : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

function numbers(input: unknown): Table | null {
  if (!input || typeof input !== 'object') return null
  const table: Table = {}
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    const n = typeof value === 'string' ? Number(value) : value
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) table[code] = n
  }
  return Object.keys(table).length > 0 ? table : null
}

/** Refreshed every minute while anyone is looking. */
async function liveTable(): Promise<{ rates: Table; asOf: string; provider: Provider } | null> {
  // Both are asked at once, so a slow main source never makes us wait twice.
  const [firstBody, secondBody] = await Promise.all([
    getJson('https://api.fxratesapi.com/latest?base=USD', 0),
    getJson('https://api.coinbase.com/v2/exchange-rates?currency=USD', 0),
  ])
  const first = firstBody as { rates?: unknown; date?: string } | null
  const fromFirst = numbers(first?.rates)
  if (fromFirst) {
    return { rates: fromFirst, asOf: first?.date ?? new Date().toISOString(), provider: FXRATES }
  }

  const second = secondBody as { data?: { rates?: unknown } } | null
  const fromSecond = numbers(second?.data?.rates)
  return fromSecond
    ? { rates: fromSecond, asOf: new Date().toISOString(), provider: COINBASE }
    : null
}

/** Published once each working day, so an hour's cache loses nothing. */
async function referenceTable(): Promise<{ rates: Table; asOf: string } | null> {
  const body = (await getJson('https://api.frankfurter.dev/v1/latest?base=USD', 3600)) as {
    rates?: unknown
    date?: string
  } | null
  const rates = numbers(body?.rates)
  return rates ? { rates, asOf: body?.date ?? '' } : null
}

/** Units of `code` per US dollar right now, or null if no source can say. */
export async function getRate(code: string): Promise<Rate | null> {
  if (code === 'USD') return { rate: 1, source: 'reference', asOf: '', provider: ECB }

  const [live, reference] = await Promise.all([liveTable(), referenceTable()])
  const chosen = pickRate(live?.rates[code], reference?.rates[code])
  if (!chosen) return null

  return {
    ...chosen,
    asOf: (chosen.source === 'live' ? live?.asOf : reference?.asOf) ?? '',
    provider: chosen.source === 'live' && live ? live.provider : ECB,
  }
}

/**
 * Units of `code` per US dollar on a past day: the European Central Bank's
 * reference rate for that day, or the last working day before it. Today uses
 * the live rate. Null if no rate can be found.
 */
export async function getRateOn(code: string, date: string, today: string): Promise<Rate | null> {
  if (code === 'USD') return { rate: 1, source: 'reference', asOf: date, provider: ECB }
  if (date >= today) return getRate(code)
  // Frankfurter answers a weekend or holiday with the last working day's rate.
  const body = (await getJson(
    `https://api.frankfurter.dev/v1/${encodeURIComponent(date)}?base=USD&symbols=${encodeURIComponent(code)}`,
    60 * 60 * 24
  )) as { rates?: unknown; date?: string } | null
  const rate = numbers(body?.rates)?.[code]
  return rate ? { rate, source: 'reference', asOf: body?.date ?? date, provider: ECB } : null
}
