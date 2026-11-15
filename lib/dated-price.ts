// Server-only: the price a purchase or sale is recorded at, found from the date it happened.
//
//   today    the live price, from the same sources as the rest of the app,
//            including a coin's price quoted directly in the display currency
//            where an exchange has one (lib/direct-prices.ts)
//   earlier  that day's closing price (or the last trading day's, if markets
//            were shut):
//              shares and funds  Yahoo Finance's daily chart
//              gold and silver   Yahoo Finance's COMEX futures close, which
//                                tracks the spot price closely
//              crypto            Coinbase Exchange daily candles (UTC days),
//                                Kraken if Coinbase has no answer
//            and if none of those answers, the daily price FolioQ saved itself.
//
// All free and keyless. Yahoo's chart endpoint is public but unofficial, so it
// may change without notice; when it fails, the saved prices take over.

import { getAssetQuotes } from '@/lib/asset-prices'
import { kindOf, priceKey, type AssetClass } from '@/lib/assets'
import { withDirectQuotes } from '@/lib/direct-prices'
import { COINBASE, KRAKEN, YAHOO, YAHOO_FUTURES, type PriceSource } from '@/lib/price-sources'
import {
  MAX_DAYS_BACK,
  closeOnOrBefore,
  parseCoinbaseCandles,
  parseKrakenOhlc,
  parseYahooChart,
  shiftDate,
  utcSeconds,
  type DailyClose,
} from '@/lib/sale-date'

export type { PriceSource }

export type DatedPrice =
  | {
      ok: true
      /** US dollars per unit. */
      price: number
      /** The trading day the price is from. Earlier than asked for if markets were shut. */
      date: string
      /** 'live' for a sale today, 'close' for a day's closing price. */
      basis: 'live' | 'close'
      source: PriceSource
      /**
       * Set when the price is a coin's quoted directly in the display currency:
       * that figure, in that currency. `price` is its US-dollar equivalent.
       */
      quoted?: { price: number; currency: string }
    }
  | { ok: false; error: string }

const SAVED_DAILY: PriceSource = { name: 'FolioQ’s saved daily prices', url: '/terms#prices' }

/** Yahoo's symbols for spot-tracking gold and silver futures. */
const METAL_FUTURES: Record<string, string> = { XAU: 'GC=F', XAG: 'SI=F' }

const NO_PRICE = 'No price could be found for that date. Try another date, or try again in a minute.'

/**
 * A past day's close doesn't change, so answers are kept for a day; the form's
 * preview and the sale itself then share one lookup. Today's can still move.
 */
async function getJson(url: string, { seconds = 60 * 60 * 24, timeout = 5000 } = {}): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      next: { revalidate: seconds },
      signal: AbortSignal.timeout(timeout),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/**
 * Yahoo's chart can take several seconds to answer, and now and then doesn't.
 * Its two public hosts are asked together and the first with prices wins.
 */
async function yahooCloses(symbol: string, date: string, today: string): Promise<DailyClose[]> {
  const from = utcSeconds(shiftDate(date, -(MAX_DAYS_BACK + 2)))
  const to = utcSeconds(shiftDate(date, 2))
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`
  const options = { seconds: date >= today ? 60 : 60 * 60 * 24, timeout: 8000 }
  try {
    return await Promise.any(
      ['query1', 'query2'].map(async (host) => {
        const points = parseYahooChart(await getJson(`https://${host}.finance.yahoo.com${path}`, options))
        if (points.length === 0) throw new Error('no prices')
        return points
      })
    )
  } catch {
    return []
  }
}

async function cryptoClose(symbol: string, date: string): Promise<{ close: DailyClose; source: PriceSource } | null> {
  const start = `${shiftDate(date, -MAX_DAYS_BACK)}T00:00:00Z`
  const end = `${date}T00:00:00Z`
  const since = utcSeconds(shiftDate(date, -(MAX_DAYS_BACK + 1)))
  const [coinbase, kraken] = await Promise.all([
    getJson(
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}-USD/candles?granularity=86400&start=${start}&end=${end}`
    ),
    getJson(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(symbol)}USD&interval=1440&since=${since}`),
  ])
  const fromCoinbase = closeOnOrBefore(parseCoinbaseCandles(coinbase), date)
  if (fromCoinbase) return { close: fromCoinbase, source: COINBASE }
  const fromKraken = closeOnOrBefore(parseKrakenOhlc(kraken), date)
  return fromKraken ? { close: fromKraken, source: KRAKEN } : null
}

/**
 * The price to record a purchase or sale at. `savedCloses` reads FolioQ's own saved daily
 * prices for a key, used when no outside source answers.
 */
export async function datedPrice(
  item: { ticker: string; assetClass: AssetClass },
  date: string,
  today: string,
  savedCloses: (key: string, from: string, to: string) => Promise<DailyClose[]>,
  /** The display currency and its rate: today's price for a coin may be quoted directly in it. */
  money: { code: string; rate: number } = { code: 'USD', rate: 1 }
): Promise<DatedPrice> {
  const kind = kindOf(item.assetClass)
  if (kind === 'cash') return { ok: false, error: 'Cash has no market price. Edit the amount instead.' }
  const key = priceKey(item.ticker, item.assetClass)

  if (date === today) {
    const live = (await withDirectQuotes([item], await getAssetQuotes([item]), money))[key]
    // A saved price is no live price: fall through to the latest close.
    if (live && live.price > 0 && live.source && !live.source.saved) {
      return {
        ok: true,
        price: live.price,
        date: today,
        basis: 'live',
        source: live.source,
        ...(live.source.pair ? { quoted: { price: live.price * money.rate, currency: money.code } } : {}),
      }
    }
    // No live price right now: the latest close is the next best thing.
  }

  let found: { close: DailyClose; source: PriceSource } | null = null
  if (kind === 'crypto') {
    found = await cryptoClose(item.ticker, date)
  } else {
    const symbol = kind === 'metal' ? METAL_FUTURES[item.ticker] : item.ticker.replace(/\./g, '-')
    const close = symbol ? closeOnOrBefore(await yahooCloses(symbol, date, today), date) : null
    if (close) found = { close, source: kind === 'metal' ? YAHOO_FUTURES : YAHOO }
  }

  if (!found) {
    const saved = closeOnOrBefore(await savedCloses(key, shiftDate(date, -MAX_DAYS_BACK), date), date)
    if (saved) found = { close: saved, source: SAVED_DAILY }
  }

  if (!found) return { ok: false, error: NO_PRICE }
  return { ok: true, price: found.close.close, date: found.close.date, basis: 'close', source: found.source }
}
