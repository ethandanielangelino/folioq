// Server-only: crypto prices on the exchange a coin was bought on.
//
// Every exchange in lib/venues.ts has a free public feed that needs no key:
//   live     its ticker: the last trade, and the price 24 hours ago where it
//            gives one (so the day's change is that exchange's own)
//   moments  its candles by the minute, hour, or day (lib/bars.ts reads them),
//            or for Kraken its individual trades, which go back for years
//
// Prices come in the exchange's quote currency and are turned into US dollars,
// which is what FolioQ stores:
//   USD    as they are
//   USDT   at USDT's own price in dollars (Kraken live, Coinbase at a moment),
//          usually within a few hundredths of a cent of $1; if neither
//          answers, at $1, and the answer says so
//   other  at the exchange rate (lib/fx.ts): live now, the day's reference
//          rate for a moment in the past
//
// Nothing here throws: an exchange that can't be reached answers
// "unavailable", one that doesn't trade the coin "unlisted", and callers fall
// back to FolioQ's automatic choice (Coinbase, then Kraken), naming it.

import { fresh } from '@/lib/fresh'
import { getRate, getRateOn } from '@/lib/fx'
import {
  barAt,
  parseBitfinex,
  parseBitstamp,
  parseCoinbase,
  parseCryptoCom,
  parseGate,
  parseHtx,
  parseIndependentReserve,
  parseIndodax,
  parseKrakenOhlc,
  parseKrakenTrades,
  parseKucoin,
  parseMsOhlc,
  parseUpbit,
  type Bar,
  type BarAt,
} from '@/lib/bars'
import { CRYPTO_VENUES, cryptoVenue, type CryptoVenue } from '@/lib/venues'
import { isCurrency } from '@/lib/currency'
import type { Quote } from '@/lib/finnhub'
import type { PriceSource } from '@/lib/price-sources'

const LIVE_SECONDS = 15
/** How long to remember that an exchange doesn't trade a coin, before asking again. */
const UNLISTED_MS = 6 * 60 * 60 * 1000

type Answer = { status: number; body: unknown }

async function fetchOnce(url: string, revalidate: number): Promise<Answer> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(6000),
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

/** Live: fetched fresh and shared for a few seconds. Otherwise kept for `revalidate` seconds. */
function get(url: string, revalidate = 0): Promise<Answer> {
  if (revalidate > 0) return fetchOnce(url, revalidate)
  return fresh(`venue:${url}`, LIVE_SECONDS, () => fetchOnce(url, 0), (a) => a.status > 0)
}

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

const lower = (s: string) => s.toLowerCase()
/** Independent Reserve and Luno call bitcoin XBT. */
const xbt = (coin: string) => (coin === 'BTC' ? 'XBT' : coin)
/** Which exchange a venue id belongs to: independentreserve-sgd is Independent Reserve. */
const base = (venue: CryptoVenue) => venue.id.split('-')[0]

// ---------------------------------------------------------------- live

type Read = { listed: false } | { listed: true; price: number | null; previous: number | null }
const unlisted: Read = { listed: false }
const unknownNow: Read = { listed: true, price: null, previous: null }
const priced = (price: unknown, previous: unknown = null): Read => ({ listed: true, price: num(price), previous: num(previous) })

/** One exchange's live price for a coin, in its quote currency. */
async function readLive(venue: CryptoVenue, coin: string): Promise<Read> {
  const c = encodeURIComponent(coin)
  const q = venue.quote
  switch (base(venue)) {
    case 'coinbase': {
      const { status, body } = await get(`https://api.exchange.coinbase.com/products/${c}-USD/stats`)
      if (status === 404 || status === 400) return unlisted
      const b = body as { last?: unknown; open?: unknown } | null
      return status === 200 ? priced(b?.last, b?.open) : unknownNow
    }
    case 'kraken': {
      const { status, body } = await get(`https://api.kraken.com/0/public/Ticker?pair=${c}USD`)
      const b = body as { error?: unknown[]; result?: Record<string, { c?: unknown[]; o?: unknown }> } | null
      if (Array.isArray(b?.error) && b.error.some((e) => /Unknown asset pair/i.test(String(e)))) return unlisted
      const pair = b?.result ? Object.values(b.result)[0] : undefined
      return status === 200 && pair ? priced(pair.c?.[0], pair.o) : unknownNow
    }
    case 'binance':
    case 'mexc': {
      const host = base(venue) === 'binance' ? 'https://data-api.binance.vision' : 'https://api.mexc.com'
      const { status, body } = await get(`${host}/api/v3/ticker/24hr?symbol=${c}USDT`)
      const b = body as { lastPrice?: unknown; openPrice?: unknown; code?: unknown } | null
      if (status === 400 && b?.code === -1121) return unlisted
      return status === 200 ? priced(b?.lastPrice, b?.openPrice) : unknownNow
    }
    case 'okx': {
      const { status, body } = await get(`https://www.okx.com/api/v5/market/ticker?instId=${c}-USDT`)
      const b = body as { code?: unknown; data?: { last?: unknown; open24h?: unknown }[] } | null
      if (b?.code === '51001') return unlisted
      return status === 200 && b?.data?.[0] ? priced(b.data[0].last, b.data[0].open24h) : unknownNow
    }
    case 'bybit': {
      const { status, body } = await get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${c}USDT`)
      const b = body as { retCode?: unknown; result?: { list?: { lastPrice?: unknown; prevPrice24h?: unknown }[] } } | null
      if (b?.retCode === 10001) return unlisted
      const row = b?.result?.list?.[0]
      return status === 200 && row ? priced(row.lastPrice, row.prevPrice24h) : unknownNow
    }
    case 'bitget': {
      const { status, body } = await get(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${c}USDT`)
      const b = body as { code?: unknown; data?: { lastPr?: unknown; open?: unknown }[] } | null
      if (b?.code === '40034') return unlisted
      return status === 200 && b?.data?.[0] ? priced(b.data[0].lastPr, b.data[0].open) : unknownNow
    }
    case 'kucoin': {
      const { status, body } = await get(`https://api.kucoin.com/api/v1/market/stats?symbol=${c}-USDT`)
      const d = (body as { data?: { last?: unknown; changePrice?: unknown } } | null)?.data
      if (status !== 200 || !d) return unknownNow
      const last = num(d.last)
      if (last === null) return unlisted
      const change = Number(d.changePrice)
      return priced(last, Number.isFinite(change) ? last - change : null)
    }
    case 'gate': {
      const { status, body } = await get(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${c}_USDT`)
      if (status === 400) return unlisted
      const row = Array.isArray(body) ? (body[0] as { last?: unknown; change_percentage?: unknown }) : undefined
      const last = num(row?.last)
      const pct = Number(row?.change_percentage)
      return status === 200 && last !== null ? priced(last, Number.isFinite(pct) ? last / (1 + pct / 100) : null) : unknownNow
    }
    case 'htx': {
      const { status, body } = await get(`https://api.huobi.pro/market/detail/merged?symbol=${lower(c)}usdt`)
      const b = body as { status?: unknown; 'err-code'?: unknown; tick?: { close?: unknown; open?: unknown } } | null
      if (b?.status === 'error' && b['err-code'] === 'invalid-parameter') return unlisted
      return status === 200 && b?.tick ? priced(b.tick.close, b.tick.open) : unknownNow
    }
    case 'cryptocom': {
      const { status, body } = await get(`https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=${c}_USD`)
      const b = body as { code?: unknown; result?: { data?: { a?: unknown; c?: unknown }[] } } | null
      if (b?.code === 40004) return unlisted
      const row = b?.result?.data?.[0]
      const last = num(row?.a)
      const ratio = Number(row?.c)
      return status === 200 && last !== null ? priced(last, Number.isFinite(ratio) ? last / (1 + ratio) : null) : unknownNow
    }
    case 'bitstamp': {
      const { status, body } = await get(`https://www.bitstamp.net/api/v2/ticker/${lower(c)}usd/`)
      // An unknown pair answers with every ticker, as a list.
      if (status === 404 || Array.isArray(body)) return unlisted
      const b = body as { last?: unknown; open?: unknown } | null
      return status === 200 ? priced(b?.last, b?.open) : unknownNow
    }
    case 'bitfinex': {
      const symbol = coin.length === 3 ? `t${c}USD` : `t${c}:USD`
      const { status, body } = await get(`https://api-pub.bitfinex.com/v2/ticker/${symbol}`)
      if (Array.isArray(body) && body[0] === 'error') return unlisted
      // [bid, bid size, ask, ask size, change, change %, last, ...]
      if (status !== 200 || !Array.isArray(body) || body.length < 7) return unknownNow
      const last = num(body[6])
      const change = Number(body[4])
      return priced(last, last !== null && Number.isFinite(change) ? last - change : null)
    }
    case 'gemini': {
      const { status, body } = await get(`https://api.gemini.com/v2/ticker/${lower(c)}usd`)
      if (status === 404 || status === 400) return unlisted
      const b = body as { close?: unknown; open?: unknown } | null
      return status === 200 ? priced(b?.close, b?.open) : unknownNow
    }
    case 'upbit': {
      const { status, body } = await get(`https://api.upbit.com/v1/ticker?markets=KRW-${c}`)
      if (status === 404) return unlisted
      const row = Array.isArray(body) ? (body[0] as { trade_price?: unknown; prev_closing_price?: unknown }) : undefined
      return status === 200 && row ? priced(row.trade_price, row.prev_closing_price) : unknownNow
    }
    case 'bithumb': {
      const { status, body } = await get(`https://api.bithumb.com/public/ticker/${c}_KRW`)
      const b = body as { status?: unknown; data?: { closing_price?: unknown; prev_closing_price?: unknown } } | null
      if (b?.status === '5500') return unlisted
      return status === 200 && b?.status === '0000' ? priced(b.data?.closing_price, b.data?.prev_closing_price) : unknownNow
    }
    case 'bitflyer': {
      const { status, body } = await get(`https://api.bitflyer.com/v1/ticker?product_code=${c}_JPY`)
      if (status === 400 || status === 404) return unlisted
      return status === 200 ? priced((body as { ltp?: unknown } | null)?.ltp) : unknownNow
    }
    case 'indodax': {
      const { status, body } = await get(`https://indodax.com/api/ticker/${lower(c)}idr`)
      const b = body as { error?: unknown; ticker?: { last?: unknown } } | null
      if (b?.error === 'invalid_pair') return unlisted
      return status === 200 ? priced(b?.ticker?.last) : unknownNow
    }
    case 'independentreserve': {
      const { status, body } = await get(
        `https://api.independentreserve.com/Public/GetMarketSummary?primaryCurrencyCode=${lower(xbt(coin))}&secondaryCurrencyCode=${lower(q)}`
      )
      if (status === 400 || status === 404) return unlisted
      return status === 200 ? priced((body as { LastPrice?: unknown } | null)?.LastPrice) : unknownNow
    }
    case 'luno': {
      const { status, body } = await get(`https://api.luno.com/api/1/ticker?pair=${xbt(coin)}${q}`)
      if (status === 400 || status === 404) return unlisted
      const b = body as { last_trade?: unknown; status?: unknown } | null
      // A market Luno has switched off trades nothing.
      if (status === 200 && b?.status === 'DISABLED') return unlisted
      return status === 200 && b?.status === 'ACTIVE' ? priced(b.last_trade) : unknownNow
    }
  }
  return unlisted
}

const notListed = new Map<string, number>()

/** An exchange's live price for a coin in its quote currency, remembering for a while that it doesn't trade it. */
async function live(venue: CryptoVenue, coin: string): Promise<Read> {
  const key = `${venue.id}:${coin}`
  if ((notListed.get(key) ?? 0) > Date.now()) return unlisted
  const read = await readLive(venue, coin)
  if (!read.listed) notListed.set(key, Date.now() + UNLISTED_MS)
  return read
}

// ---------------------------------------------------------------- quote currencies in US dollars

export interface Conversion {
  /** US dollars per one unit of the quote currency. */
  usd: number
  /** Said beside the price when the conversion matters: "1 USDT = US$0.9988 on Kraken". */
  note: string | null
}

/** US dollars per USDT right now: Kraken's live market, else Coinbase's. */
async function usdtNow(): Promise<number | null> {
  const kraken = await get('https://api.kraken.com/0/public/Ticker?pair=USDTUSD')
  const pair = (kraken.body as { result?: Record<string, { c?: unknown[] }> } | null)?.result
  const k = pair ? num(Object.values(pair)[0]?.c?.[0]) : null
  if (k !== null) return k
  const coinbase = await get('https://api.exchange.coinbase.com/products/USDT-USD/stats')
  return num((coinbase.body as { last?: unknown } | null)?.last)
}

const usdt = (rate: number, where: string): Conversion => ({
  usd: rate,
  note: `1 USDT = US$${rate.toFixed(4)} on ${where}`,
})
const usdtAssumed: Conversion = { usd: 1, note: 'USDT counted as US$1, as no USDT price was found' }

/** Live: US dollars per unit of an exchange's quote currency. Null if no rate is found. */
export async function conversionNow(quote: string): Promise<Conversion | null> {
  if (quote === 'USD') return { usd: 1, note: null }
  if (quote === 'USDT') {
    const rate = await usdtNow()
    return rate !== null ? usdt(rate, 'Kraken') : usdtAssumed
  }
  const found = await getRate(quote)
  return found ? { usd: 1 / found.rate, note: null } : null
}

/** At a moment: US dollars per unit of a quote currency then. */
export async function conversionAt(quote: string, moment: number, now: number, today: string): Promise<Conversion | null> {
  if (quote === 'USD') return { usd: 1, note: null }
  if (quote === 'USDT') {
    const coinbase = await barsAt(cryptoVenue('coinbase')!, 'USDT', moment, now)
    if (coinbase) return usdt(coinbase.bar.close, 'Coinbase at that time')
    const kraken = await barsAt(cryptoVenue('kraken')!, 'USDT', moment, now)
    return kraken ? usdt(kraken.bar.close, 'Kraken at that time') : usdtAssumed
  }
  const date = new Date(moment * 1000).toISOString().slice(0, 10)
  const found = await getRateOn(quote, date, today)
  return found ? { usd: 1 / found.rate, note: null } : null
}

// ---------------------------------------------------------------- candles

/** How far before a moment to look for the last trade, at each bar length. */
const LOOKBACK: Record<number, number> = { 60: 3600, 3600: 2 * 86_400, 86_400: 6 * 86_400 }

const iso = (s: number) => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Korea's local time, without a zone: what Bithumb's candles take. */
const kst = (s: number) => new Date((s + 9 * 3600) * 1000).toISOString().slice(0, 19)

/**
 * An exchange's bars of one length around a moment, in its quote currency.
 * Null when it doesn't keep bars of that length, or not that far back.
 */
async function venueBars(venue: CryptoVenue, coin: string, length: number, moment: number, now: number): Promise<Bar[] | null> {
  const from = moment - LOOKBACK[length]
  const to = Math.min(moment + length, now)
  // A past bar doesn't change; one still forming does.
  const keep = now - moment > 2 * length + 120 ? 60 * 60 * 24 : 30
  const c = encodeURIComponent(coin)
  const ms = (s: number) => s * 1000
  const pick = <T>(byLength: Record<number, T>) => byLength[length]
  const at = async (url: string, read: (body: unknown) => Bar[]) => {
    const { status, body } = await get(url, keep)
    return status === 200 ? read(body) : null
  }

  switch (base(venue)) {
    case 'coinbase':
      return at(
        `https://api.exchange.coinbase.com/products/${c}-USD/candles?granularity=${length}&start=${iso(from)}&end=${iso(to)}`,
        (b) => parseCoinbase(b, length)
      )
    case 'kraken':
      // Kraken's candles only reach back 720 bars, but its trades go back for years.
      if (length === 60) {
        return at(`https://api.kraken.com/0/public/Trades?pair=${c}USD&since=${(moment - 180) * 1e9}&count=1000`, parseKrakenTrades)
      }
      return at(
        `https://api.kraken.com/0/public/OHLC?pair=${c}USD&interval=${length / 60}&since=${from}`,
        (b) => parseKrakenOhlc(b, length)
      )
    case 'binance':
      return at(
        `https://data-api.binance.vision/api/v3/klines?symbol=${c}USDT&interval=${pick({ 60: '1m', 3600: '1h', 86400: '1d' })}&startTime=${ms(from)}&endTime=${ms(to)}&limit=1000`,
        (b) => parseMsOhlc(b, length)
      )
    case 'mexc':
      return at(
        `https://api.mexc.com/api/v3/klines?symbol=${c}USDT&interval=${pick({ 60: '1m', 3600: '60m', 86400: '1d' })}&startTime=${ms(from)}&endTime=${ms(to)}&limit=1000`,
        (b) => parseMsOhlc(b, length)
      )
    case 'okx':
      return at(
        `https://www.okx.com/api/v5/market/history-candles?instId=${c}-USDT&bar=${pick({ 60: '1m', 3600: '1H', 86400: '1Dutc' })}&after=${ms(to) + 1}&limit=100`,
        (b) => parseMsOhlc((b as { data?: unknown } | null)?.data, length)
      )
    case 'bybit':
      return at(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${c}USDT&interval=${pick({ 60: '1', 3600: '60', 86400: 'D' })}&start=${ms(from)}&end=${ms(to)}&limit=1000`,
        (b) => parseMsOhlc((b as { result?: { list?: unknown } } | null)?.result?.list, length)
      )
    case 'bitget':
      return at(
        `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${c}USDT&granularity=${pick({ 60: '1min', 3600: '1h', 86400: '1Dutc' })}&endTime=${ms(to)}&limit=200`,
        (b) => parseMsOhlc((b as { data?: unknown } | null)?.data, length)
      )
    case 'kucoin':
      return at(
        `https://api.kucoin.com/api/v1/market/candles?type=${pick({ 60: '1min', 3600: '1hour', 86400: '1day' })}&symbol=${c}-USDT&startAt=${from}&endAt=${to}`,
        (b) => parseKucoin(b, length)
      )
    case 'gate':
      // Gate keeps 10,000 bars of each length: a week of minutes, a year of hours. Older asks get a 400.
      return at(
        `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${c}_USDT&interval=${pick({ 60: '1m', 3600: '1h', 86400: '1d' })}&from=${from}&to=${to}`,
        (b) => parseGate(b, length)
      )
    case 'htx':
      // Only the latest 2,000 bars of each length: about a day of minutes, 80 days of hours.
      return at(
        `https://api.huobi.pro/market/history/kline?symbol=${lower(c)}usdt&period=${pick({ 60: '1min', 3600: '60min', 86400: '1day' })}&size=2000`,
        (b) => parseHtx(b, length)
      )
    case 'cryptocom':
      return at(
        `https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=${c}_USD&timeframe=${pick({ 60: '1m', 3600: '1h', 86400: '1D' })}&start_ts=${ms(from)}&end_ts=${ms(to)}&count=300`,
        (b) => parseCryptoCom(b, length)
      )
    case 'bitstamp':
      return at(
        `https://www.bitstamp.net/api/v2/ohlc/${lower(c)}usd/?step=${length}&start=${from}&end=${to}&limit=1000`,
        (b) => parseBitstamp(b, length)
      )
    case 'bitfinex': {
      const symbol = coin.length === 3 ? `t${c}USD` : `t${c}:USD`
      return at(
        `https://api-pub.bitfinex.com/v2/candles/trade:${pick({ 60: '1m', 3600: '1h', 86400: '1D' })}:${symbol}/hist?start=${ms(from)}&end=${ms(to)}&sort=1&limit=1000`,
        (b) => parseBitfinex(b, length)
      )
    }
    case 'gemini':
      // Only the latest bars of each length.
      return at(
        `https://api.gemini.com/v2/candles/${lower(c)}usd/${pick({ 60: '1m', 3600: '1hr', 86400: '1day' })}`,
        (b) => parseMsOhlc(b, length)
      )
    case 'upbit':
      return at(
        `https://api.upbit.com/v1/candles/${pick({ 60: 'minutes/1', 3600: 'minutes/60', 86400: 'days' })}?market=KRW-${c}&to=${iso(to)}&count=200`,
        (b) => parseUpbit(b, length)
      )
    case 'bithumb':
      return at(
        `https://api.bithumb.com/v1/candles/${pick({ 60: 'minutes/1', 3600: 'minutes/60', 86400: 'days' })}?market=KRW-${c}&to=${kst(to)}&count=200`,
        (b) => parseUpbit(b, length)
      )
    case 'indodax':
      return at(
        `https://indodax.com/tradingview/history_v2?symbol=${c}IDR&tf=${pick({ 60: '1', 3600: '60', 86400: '1D' })}&from=${from}&to=${to}`,
        (b) => parseIndodax(b, length)
      )
    case 'independentreserve': {
      // Hourly summaries for the last 240 hours, nothing finer or older.
      const hours = Math.ceil((now - from) / 3600) + 1
      if (length !== 3600 || hours > 240) return null
      return at(
        `https://api.independentreserve.com/Public/GetTradeHistorySummary?primaryCurrencyCode=${lower(xbt(coin))}&secondaryCurrencyCode=${lower(venue.quote)}&numberOfHoursInThePastToRetrieve=${hours}`,
        parseIndependentReserve
      )
    }
  }
  // bitFlyer and Luno publish no past prices without an account.
  return null
}

export interface VenueMoment extends BarAt {
  /** How long the bar is: 60, 3600, or 86400 seconds. */
  seconds: number
}

/** The finest bar an exchange has for a moment (a minute, else an hour, else a day), in its quote currency. */
export async function barsAt(venue: CryptoVenue, coin: string, moment: number, now: number): Promise<VenueMoment | null> {
  for (const length of [60, 3600, 86_400]) {
    const bars = await venueBars(venue, coin, length, moment, now)
    if (!bars) continue
    const found = barAt(bars, moment, LOOKBACK[length])
    if (found) return { ...found, seconds: length }
  }
  return null
}

/** An exchange's daily bars around a date, in its quote currency: for a purchase given by date only. */
export async function dailyBars(venue: CryptoVenue, coin: string, date: string, now: number): Promise<Bar[]> {
  const endOfDay = Date.parse(`${date}T23:59:59Z`) / 1000
  return (await venueBars(venue, coin, 86_400, Math.min(endOfDay, now), now)) ?? []
}

// ---------------------------------------------------------------- quotes for holdings

export type VenueLookup =
  | { status: 'ok'; quote: Quote; local: { price: number; currency: string }; conversion: Conversion }
  | { status: 'unlisted' }
  | { status: 'unavailable' }

/** The source a venue's price is credited to: "Binance (BTC/USDT)". */
export function venueSource(venue: CryptoVenue, coin: string): PriceSource {
  return { name: venue.name, url: venue.url, pair: `${coin}/${venue.quote}`, venue: true }
}

/** A coin's live price on an exchange, in US dollars, with the exchange's own 24-hour change. */
export async function venueQuote(venueId: string, coin: string): Promise<VenueLookup> {
  const venue = cryptoVenue(venueId)
  if (!venue) return { status: 'unlisted' }
  const [read, conversion] = await Promise.all([live(venue, coin), conversionNow(venue.quote)])
  if (!read.listed) return { status: 'unlisted' }
  if (read.price === null || !conversion) return { status: 'unavailable' }
  const price = read.price * conversion.usd
  const previous = read.previous !== null ? read.previous * conversion.usd : null
  return {
    status: 'ok',
    local: { price: read.price, currency: venue.quote },
    conversion,
    quote: {
      price,
      change: previous === null ? null : price - previous,
      changePercent: previous ? (price - previous) / previous : 0,
      high: Math.max(price, previous ?? price),
      low: Math.min(price, previous ?? price),
      open: previous ?? price,
      previousClose: previous ?? price,
      timestamp: Math.floor(Date.now() / 1000),
      source: venueSource(venue, coin),
    },
  }
}

export interface VenueOption {
  id: string
  /** The live price in the exchange's quote currency, when it answered. */
  price: number | null
  /** The same in US dollars. */
  usd: number | null
  quote: string
  /** False when the exchange couldn't be reached just now: it may still trade the coin. */
  answered: boolean
}

/**
 * Every exchange that trades a coin, with its live price, for the picker.
 * Exchanges that couldn't be reached are kept (marked), so a slow feed never
 * hides someone's exchange; ones that said they don't trade it are left out.
 */
export async function venuesFor(coin: string): Promise<VenueOption[]> {
  const answers = await Promise.all(CRYPTO_VENUES.map((v) => venueQuote(v.id, coin)))
  const out: VenueOption[] = []
  CRYPTO_VENUES.forEach((v, i) => {
    const a = answers[i]
    if (a.status === 'unlisted') return
    out.push(
      a.status === 'ok'
        ? { id: v.id, price: a.local.price, usd: a.quote.price, quote: v.quote, answered: true }
        : { id: v.id, price: null, usd: null, quote: v.quote, answered: false }
    )
  })
  return out
}

/**
 * The quotes to value holdings with: a coin priced on a chosen exchange takes
 * that exchange's live price. If the exchange doesn't answer, the automatic
 * price stays, so the holding is still valued.
 */
export async function withVenueQuotes(
  items: { key: string; ticker: string; venue: string | null }[],
  quotes: Record<string, Quote | null>
): Promise<Record<string, Quote | null>> {
  const chosen = items.filter((i) => i.venue)
  if (chosen.length === 0) return quotes
  const out = { ...quotes }
  await Promise.all(
    chosen.map(async (item) => {
      const found = await venueQuote(item.venue!, item.ticker)
      if (found.status === 'ok') out[item.key] = found.quote
    })
  )
  return out
}

/** Whether a quote currency is one FolioQ can show amounts in (USDT isn't). */
export function showable(quote: string): boolean {
  return quote !== 'USD' && isCurrency(quote)
}
