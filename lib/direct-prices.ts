// Server-only: crypto prices quoted directly in the display currency.
//
// FolioQ's prices are in US dollars and converted for display. Where an
// exchange trades a coin directly in the display currency (BTC/SGD on
// Independent Reserve, BTC/EUR on Coinbase), that market's price is used
// instead, so the figure is what the coin costs in that currency rather than
// a conversion. Exchanges per currency are in DIRECT_CRYPTO (lib/price-sources).
//
// A direct price is used only when it is sound:
//   - from the middle of the best bid and offer, and only when they are within
//     2% of each other (a thin market's last trade can be stale): midPrice
//   - within 5% of the US-dollar price converted, so one odd market
//     can't put a wild number on someone's portfolio: believable
// Otherwise the converted US-dollar price stands, and says so.
//
// Everything stays in US dollars underneath: a direct price is stored as its
// US-dollar equivalent at the display rate, so it shows exactly as quoted. The
// 24-hour change is the coin's move in the US-dollar market.

import { kindOf, priceKey, type AssetClass } from '@/lib/assets'
import type { Quote } from '@/lib/finnhub'
import { fresh } from '@/lib/fresh'
import {
  COINBASE,
  INDEPENDENT_RESERVE,
  KRAKEN,
  LUNO,
  believable,
  directExchanges,
  midPrice,
  type PriceSource,
} from '@/lib/price-sources'

const LIVE_SECONDS = 15
/** How long to remember that an exchange doesn't trade a pair, before asking again. */
const UNLISTED_MS = 6 * 60 * 60 * 1000

type Answer = { status: number; body: unknown }

async function getJson(url: string): Promise<Answer> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // keep the status
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

const num = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

type Read = { listed: false } | { listed: true; price: number | null }

/** One exchange's price for coin/currency. "Not listed" is told apart from "couldn't say right now". */
async function ask(source: PriceSource, coin: string, currency: string): Promise<Read> {
  const c = encodeURIComponent(coin)
  const cur = encodeURIComponent(currency)
  if (source === COINBASE) {
    const { status, body } = await getJson(`https://api.exchange.coinbase.com/products/${c}-${cur}/ticker`)
    if (status === 404 || status === 400) return { listed: false }
    const b = body as { bid?: unknown; ask?: unknown } | null
    return { listed: true, price: status === 200 ? midPrice(num(b?.bid), num(b?.ask)) : null }
  }
  if (source === KRAKEN) {
    const { status, body } = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${c}${cur}`)
    const b = body as { error?: unknown[]; result?: Record<string, { a?: unknown[]; b?: unknown[] }> } | null
    if (status === 200 && Array.isArray(b?.error) && b.error.some((e) => /Unknown asset pair/i.test(String(e)))) {
      return { listed: false }
    }
    const pair = b?.result ? Object.values(b.result)[0] : undefined
    return { listed: true, price: status === 200 ? midPrice(num(pair?.b?.[0]), num(pair?.a?.[0])) : null }
  }
  // Independent Reserve and Luno call bitcoin XBT.
  const code = coin === 'BTC' ? 'XBT' : coin
  if (source === INDEPENDENT_RESERVE) {
    const { status, body } = await getJson(
      `https://api.independentreserve.com/Public/GetMarketSummary?primaryCurrencyCode=${encodeURIComponent(code.toLowerCase())}&secondaryCurrencyCode=${cur.toLowerCase()}`
    )
    if (status === 400 || status === 404) return { listed: false }
    const b = body as { CurrentHighestBidPrice?: unknown; CurrentLowestOfferPrice?: unknown } | null
    return {
      listed: true,
      price: status === 200 ? midPrice(num(b?.CurrentHighestBidPrice), num(b?.CurrentLowestOfferPrice)) : null,
    }
  }
  if (source === LUNO) {
    const { status, body } = await getJson(`https://api.luno.com/api/1/ticker?pair=${encodeURIComponent(code)}${cur}`)
    if (status === 400 || status === 404) return { listed: false }
    const b = body as { bid?: unknown; ask?: unknown; status?: unknown } | null
    return {
      listed: true,
      price: status === 200 && b?.status === 'ACTIVE' ? midPrice(num(b?.bid), num(b?.ask)) : null,
    }
  }
  return { listed: false }
}

const unlisted = new Map<string, number>()

/** An exchange's direct price for a coin in a currency, or null. Reused for a few seconds. */
function directPrice(source: PriceSource, coin: string, currency: string): Promise<number | null> {
  const key = `${source.name}:${coin}/${currency}`
  if ((unlisted.get(key) ?? 0) > Date.now()) return Promise.resolve(null)
  return fresh(
    `direct:${key}`,
    LIVE_SECONDS,
    async () => {
      const read = await ask(source, coin, currency)
      if (!read.listed) {
        unlisted.set(key, Date.now() + UNLISTED_MS)
        return null
      }
      return read.price
    },
    (price) => price !== null
  )
}

/**
 * The quotes to value holdings with in the display currency: for each coin an
 * exchange quotes directly in that currency, its price (as US dollars at the
 * display rate, naming the exchange and pair); everything else unchanged.
 */
export async function withDirectQuotes(
  items: { ticker: string; assetClass: AssetClass }[],
  quotes: Record<string, Quote | null>,
  money: { code: string; rate: number }
): Promise<Record<string, Quote | null>> {
  const exchanges = directExchanges(money.code)
  if (money.code === 'USD' || !(money.rate > 0) || exchanges.length === 0) return quotes

  const coins = new Map<string, string>()
  for (const item of items) {
    if (kindOf(item.assetClass) === 'crypto') coins.set(priceKey(item.ticker, item.assetClass), item.ticker)
  }
  const out = { ...quotes }
  await Promise.all(
    [...coins].map(async ([key, coin]) => {
      const usd = quotes[key]
      // Without a live US-dollar price there is nothing to check a direct one against.
      if (!usd || usd.source?.saved) return
      const converted = usd.price * money.rate
      const answers = await Promise.all(exchanges.map((source) => directPrice(source, coin, money.code)))
      const at = answers.findIndex((price) => price !== null && believable(price, converted))
      if (at === -1) return

      const price = answers[at]! / money.rate
      // The day's move as the US-dollar market saw it, applied to the direct price.
      const ratio = usd.change !== null && usd.previousClose > 0 ? usd.price / usd.previousClose : null
      const previous = ratio ? price / ratio : price
      out[key] = {
        ...usd,
        price,
        change: ratio ? price - previous : usd.change,
        previousClose: previous,
        open: previous,
        high: Math.max(price, previous),
        low: Math.min(price, previous),
        source: { ...exchanges[at], pair: `${coin}/${money.code}` },
      }
    })
  )
  return out
}
