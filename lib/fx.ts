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

type Table = Record<string, number>

export interface Rate {
  rate: number
  source: 'live' | 'reference'
  /** When the figure is from: an ISO timestamp for live, a date for reference. */
  asOf: string
}

async function getJson(url: string, revalidateSeconds: number): Promise<unknown> {
  try {
    const res = await fetch(url, {
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(6000),
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
async function liveTable(): Promise<{ rates: Table; asOf: string } | null> {
  const first = (await getJson('https://api.fxratesapi.com/latest?base=USD', 60)) as {
    rates?: unknown
    date?: string
  } | null
  const fromFirst = numbers(first?.rates)
  if (fromFirst) return { rates: fromFirst, asOf: first?.date ?? new Date().toISOString() }

  const second = (await getJson('https://api.coinbase.com/v2/exchange-rates?currency=USD', 60)) as {
    data?: { rates?: unknown }
  } | null
  const fromSecond = numbers(second?.data?.rates)
  return fromSecond ? { rates: fromSecond, asOf: new Date().toISOString() } : null
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
  if (code === 'USD') return { rate: 1, source: 'reference', asOf: '' }

  const [live, reference] = await Promise.all([liveTable(), referenceTable()])
  const chosen = pickRate(live?.rates[code], reference?.rates[code])
  if (!chosen) return null

  return {
    ...chosen,
    asOf: (chosen.source === 'live' ? live?.asOf : reference?.asOf) ?? '',
  }
}
