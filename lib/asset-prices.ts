// Server-only: live prices for every kind of holding, in US dollars.
//
//   listed  Finnhub (lib/finnhub.ts), as before
//   crypto  Coinbase Exchange's 24-hour stats, Kraken if Coinbase has no
//           answer. "Change" is over the last 24 hours: crypto trades all
//           day, every day, so it has no closing bell to measure from.
//   metal   gold-api.com, per troy ounce. Its change is against the last
//           price FolioQ saved on an earlier day, when there is one.
//   cash    1 unit of the currency in US dollars, from the exchange rates in
//           lib/fx.ts. Its change is likewise against the last saved day.
//
// All keyless and free. Prices are fetched live and reused for 15 seconds
// (lib/fresh.ts); a coin's name, which doesn't change, is cached for a day.

import { kindOf, priceKey, type AssetClass } from '@/lib/assets'
import { getQuotes, type Quote } from '@/lib/finnhub'
import { fresh } from '@/lib/fresh'
import { COINBASE, GOLD_API, KRAKEN, SAVED, type PriceSource } from '@/lib/price-sources'
import { getRate } from '@/lib/fx'

export interface PricedItem {
  ticker: string
  assetClass: AssetClass
}

type Result = Quote | null

/** How long a live price is reused before the source is asked again. */
const LIVE_SECONDS = 15

/**
 * The answer and its HTTP status. Status 0 means the service couldn't be
 * reached at all, which is different from it saying "no such thing" (404).
 * `seconds` of 0 means live: fetched fresh, reused for a few seconds only.
 */
function request(url: string, seconds = 0): Promise<{ status: number; body: unknown }> {
  if (seconds > 0) return fetchOnce(url, seconds)
  return fresh(`asset:${url}`, LIVE_SECONDS, () => fetchOnce(url, 0), (answer) => answer.status > 0)
}

async function fetchOnce(url: string, seconds: number): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      ...(seconds > 0 ? { next: { revalidate: seconds } } : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(5000),
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // Not JSON: keep the status, which is what matters.
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

async function getJson(url: string, seconds = 0): Promise<unknown> {
  const { status, body } = await request(url, seconds)
  return status >= 200 && status < 300 ? body : null
}

const positive = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** A quote for something that has no exchange session: high and low are just the price. */
function quote(price: number, previous: number | null, source?: PriceSource): Quote {
  const change = previous === null ? null : price - previous
  return {
    price,
    change,
    changePercent: previous && change !== null ? change / previous : 0,
    high: Math.max(price, previous ?? price),
    low: Math.min(price, previous ?? price),
    open: previous ?? price,
    previousClose: previous ?? price,
    timestamp: Math.floor(Date.now() / 1000),
    ...(source ? { source } : {}),
  }
}

// ---------------------------------------------------------------- crypto

export type CryptoLookup = { status: 'ok'; quote: Quote } | { status: 'unknown' } | { status: 'unavailable' }

export async function lookupCrypto(symbol: string): Promise<CryptoLookup> {
  // Asked together, so a slow Coinbase never makes the page wait for Kraken afterwards.
  const [coinbase, kraken] = await Promise.all([
    request(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}-USD/stats`),
    request(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(symbol)}USD`),
  ])
  const stats = coinbase.body as { last?: unknown; open?: unknown } | null
  const last = coinbase.status === 200 ? positive(stats?.last) : null
  if (last !== null) return { status: 'ok', quote: quote(last, positive(stats?.open), COINBASE) }

  // Kraken answers with the pair under its own name (XXBTZUSD for BTCUSD), so take the first.
  const ticker = kraken.body as { error?: unknown[]; result?: Record<string, { c?: unknown[]; o?: unknown }> } | null
  const pair = ticker?.result ? Object.values(ticker.result)[0] : undefined
  const krakenLast = kraken.status === 200 ? positive(pair?.c?.[0]) : null
  if (krakenLast !== null) return { status: 'ok', quote: quote(krakenLast, positive(pair?.o), KRAKEN) }

  // Both answered and neither lists it: no such coin. If either couldn't be
  // reached, we can't tell, so the caller lets it through.
  const coinbaseSaidNo = coinbase.status === 404 || coinbase.status === 400
  const krakenSaidNo =
    kraken.status === 200 && Array.isArray(ticker?.error) && ticker.error.some((e) => /Unknown asset pair/i.test(String(e)))
  return coinbaseSaidNo && krakenSaidNo ? { status: 'unknown' } : { status: 'unavailable' }
}

/** "Bitcoin" for BTC. Null if Coinbase doesn't know the coin. */
export async function cryptoName(symbol: string): Promise<string | null> {
  const body = (await getJson(
    `https://api.exchange.coinbase.com/currencies/${encodeURIComponent(symbol)}`,
    60 * 60 * 24
  )) as { name?: unknown } | null
  return typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null
}

// ---------------------------------------------------------------- metals and cash

async function metalPrice(symbol: string): Promise<number | null> {
  const body = (await getJson(`https://api.gold-api.com/price/${encodeURIComponent(symbol)}`)) as {
    price?: unknown
  } | null
  return positive(body?.price)
}

/** US dollars per one unit of this currency, and the site the rate came from (none for US dollars). */
async function cashPrice(code: string): Promise<{ price: number; source?: PriceSource } | null> {
  if (code === 'USD') return { price: 1 }
  const found = await getRate(code)
  return found ? { price: 1 / found.rate, source: { name: found.provider.name, url: found.provider.url } } : null
}

// ---------------------------------------------------------------- all together

/**
 * Prices for a set of holdings, keyed by priceKey(ticker, assetClass).
 * `previousCloses` is the last price saved for each key on an earlier day;
 * metals and cash measure their change against it.
 */
export async function getAssetQuotes(
  items: PricedItem[],
  previousCloses: Record<string, number> = {}
): Promise<Record<string, Result>> {
  const unique = new Map<string, PricedItem>()
  for (const item of items) unique.set(priceKey(item.ticker, item.assetClass), item)

  const listed = [...unique.entries()].filter(([, item]) => kindOf(item.assetClass) === 'listed')
  const others = [...unique.entries()].filter(([, item]) => kindOf(item.assetClass) !== 'listed')

  const [listedQuotes, otherQuotes] = await Promise.all([
    getQuotes(listed.map(([, item]) => item.ticker)),
    Promise.all(
      others.map(async ([key, item]): Promise<[string, Result]> => {
        const kind = kindOf(item.assetClass)
        const saved = previousCloses[key] ?? null
        if (kind === 'crypto') {
          const found = await lookupCrypto(item.ticker)
          if (found.status === 'ok') return [key, found.quote]
          // No live answer: the last price saved, with no change claimed, beats valuing it at nothing.
          return [key, saved !== null ? quote(saved, saved, SAVED) : null]
        }
        const found =
          kind === 'metal'
            ? await metalPrice(item.ticker).then((price) => (price === null ? null : { price, source: GOLD_API }))
            : await cashPrice(item.ticker)
        if (found === null) return [key, saved !== null ? quote(saved, saved, SAVED) : null]
        // US dollars held as cash never move against themselves.
        const previous = kind === 'cash' && item.ticker === 'USD' ? 1 : (previousCloses[key] ?? null)
        return [key, quote(found.price, previous, found.source)]
      })
    ),
  ])

  const out: Record<string, Result> = {}
  for (const [key, item] of listed) {
    // No live answer (Finnhub busy or rate-limited): the last price saved, marked as such.
    const saved = previousCloses[key] ?? null
    out[key] = listedQuotes[item.ticker] ?? (saved !== null ? quote(saved, saved, SAVED) : null)
  }
  for (const [key, result] of otherQuotes) out[key] = result
  return out
}

/** The last saved price for each key on a day before `today`. */
export function lastClosesBefore(
  rows: { ticker: string; price_date: string; close: number | string }[],
  today: string
): Record<string, number> {
  const latest: Record<string, { date: string; close: number }> = {}
  for (const row of rows) {
    const date = String(row.price_date).slice(0, 10)
    if (date >= today) continue
    const seen = latest[row.ticker]
    if (!seen || date > seen.date) latest[row.ticker] = { date, close: Number(row.close) }
  }
  return Object.fromEntries(Object.entries(latest).map(([key, value]) => [key, value.close]))
}
