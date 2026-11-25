// Server-only: the price a purchase or sale is recorded at, found from when it happened.
//
//   a time   given with the date: the price at that moment, from the finest
//            bars the source still keeps (lib/bars.ts):
//              crypto on a chosen exchange  that exchange's minute, hour, or
//                                           day bars (lib/venue-prices.ts)
//              other crypto                 Coinbase by the minute, Kraken's
//                                           individual trades if not
//              shares, funds, gold, silver  Yahoo Finance by the minute for
//                                           30 days, by 5 minutes for 60, by
//                                           the hour for two years
//            If the market was shut then, the last trade before it, and the
//            answer says so. Older than any source keeps, the day's close.
//   today    the live price, from the same sources as the rest of the app:
//            a chosen exchange's own price, or a coin's price quoted directly
//            in the display currency where an exchange has one
//            (lib/direct-prices.ts)
//   earlier  that day's closing price (or the last trading day's, if markets
//            were shut):
//              shares and funds  Yahoo Finance's daily chart
//              gold and silver   Yahoo Finance's COMEX futures close, which
//                                tracks the spot price closely
//              crypto            the chosen exchange's daily bar, else
//                                Coinbase Exchange daily candles (UTC days),
//                                Kraken if Coinbase has no answer
//            and if none of those answers, the daily price FolioQ saved itself.
//
// Prices in another currency (a share in Singapore, a coin on Upbit in won,
// on Binance in USDT) are turned into US dollars at the rate then: the live
// rate today, the day's reference rate before. All free and keyless. Yahoo's
// chart endpoint is public but unofficial, so it may change without notice;
// when it fails, the saved prices take over.

import { getAssetQuotes } from '@/lib/asset-prices'
import { kindOf, priceKey, type AssetClass } from '@/lib/assets'
import { barDate } from '@/lib/bars'
import { isCurrency } from '@/lib/currency'
import { withDirectQuotes } from '@/lib/direct-prices'
import { getRate, getRateOn } from '@/lib/fx'
import { COINBASE, KRAKEN, YAHOO, YAHOO_FUTURES, type PriceSource } from '@/lib/price-sources'
import {
  MAX_DAYS_BACK,
  closeOnOrBefore,
  parseCoinbaseCandles,
  parseKrakenOhlc,
  shiftDate,
  utcSeconds,
  type DailyClose,
} from '@/lib/sale-date'
import { barsAt, conversionAt, dailyBars, showable, venueQuote, venueSource } from '@/lib/venue-prices'
import { cryptoVenue, type CryptoVenue } from '@/lib/venues'
import { yahooAt, yahooDailyCloses } from '@/lib/yahoo'

export type { PriceSource }

export interface PriceMoment {
  /** The moment asked about, unix seconds. */
  asked: number
  /** The bar the price is from: when it starts and how long it lasts (60, 300, or 3600 seconds). */
  start: number
  seconds: number
  /** The lowest and highest price in that bar, US dollars per unit. */
  low: number
  high: number
  /** False when nothing traded at the moment itself (a market shut for the night): the bar is the last one before. */
  inside: boolean
}

export type DatedPrice =
  | {
      ok: true
      /** US dollars per unit. */
      price: number
      /** The trading day the price is from. Earlier than asked for if markets were shut. */
      date: string
      /** 'live' for now, 'close' for a day's closing price, 'moment' for the price at a time of day. */
      basis: 'live' | 'close' | 'moment'
      source: PriceSource
      /**
       * Set when the source priced it in a currency FolioQ can show: a coin
       * quoted directly in the display currency, a coin on an exchange that
       * prices in won, a share listed in Singapore. That figure, in that
       * currency; `price` is its US-dollar equivalent.
       */
      quoted?: { price: number; currency: string }
      /** For 'moment': the bar the price came from. */
      moment?: PriceMoment
      /** Something worth saying beside the price: a conversion, or why another source was used. */
      note?: string
    }
  | { ok: false; error: string }

type Found = Extract<DatedPrice, { ok: true }>

const SAVED_DAILY: PriceSource = { name: 'FolioQ’s saved daily prices', url: '/terms#prices' }

/** Yahoo's symbols for spot-tracking gold and silver futures. */
const METAL_FUTURES: Record<string, string> = { XAU: 'GC=F', XAG: 'SI=F' }

const NO_PRICE = 'No price could be found for that date. Try another date, or try again in a minute.'

/** A moment this close to now is "now": the live price is the price. */
const NOW_SECONDS = 90

async function getJson(url: string, seconds = 60 * 60 * 24): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FolioQ price lookup' },
      next: { revalidate: seconds },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
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

/** Units of `currency` per US dollar on a date (today: live). Null if none is found. */
async function rateOn(currency: string, date: string, today: string): Promise<number | null> {
  if (currency === 'USD') return 1
  return (await getRateOn(currency, date, today))?.rate ?? null
}

const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- at a moment

/** A coin at a moment on an exchange, in US dollars. Null if the exchange has no price then. */
async function venueAt(venue: CryptoVenue, coin: string, at: number, now: number, today: string): Promise<Found | null> {
  const found = await barsAt(venue, coin, at, now)
  if (!found) return null
  const conversion = await conversionAt(venue.quote, at, now, today)
  if (!conversion) return null
  const b = found.bar
  const usd = (v: number) => v * conversion.usd
  const quoted = showable(venue.quote) ? { price: b.close, currency: venue.quote } : undefined
  const daily = found.seconds >= 86_400
  return {
    ok: true,
    price: usd(b.close),
    date: daily ? barDate(b) : dayOf(b.start),
    basis: daily ? 'close' : 'moment',
    source: venueSource(venue, coin),
    ...(quoted ? { quoted } : {}),
    ...(daily
      ? {}
      : { moment: { asked: at, start: b.start, seconds: found.seconds, low: usd(b.low), high: usd(b.high), inside: found.inside } }),
    ...(conversion.note ? { note: conversion.note } : {}),
  }
}

/** A coin at a moment from FolioQ's automatic sources: Coinbase, then Kraken. Prices are in US dollars. */
async function autoCryptoAt(coin: string, at: number, now: number, today: string): Promise<Found | null> {
  for (const id of ['coinbase', 'kraken']) {
    const found = await venueAt(cryptoVenue(id)!, coin, at, now, today)
    if (found) return { ...found, source: id === 'coinbase' ? COINBASE : KRAKEN }
  }
  return null
}

/** A share, fund, or gold or silver at a moment, from Yahoo Finance, in US dollars. */
async function listedAt(item: { ticker: string; assetClass: AssetClass }, at: number, now: number, today: string): Promise<Found | null> {
  const metal = kindOf(item.assetClass) === 'metal'
  const symbol = metal ? METAL_FUTURES[item.ticker] : item.ticker
  if (!symbol) return null
  const found = await yahooAt(symbol, at, now)
  if (!found) return null
  const rate = await rateOn(found.currency, dayOf(found.bar.start), today)
  if (rate === null) return null
  const usd = (v: number) => v / rate
  const b = found.bar
  const foreign = found.currency !== 'USD' && isCurrency(found.currency)
  return {
    ok: true,
    price: usd(b.close),
    date: dayOf(b.start),
    basis: 'moment',
    source: metal ? YAHOO_FUTURES : foreign ? { ...YAHOO, currency: found.currency } : YAHOO,
    ...(foreign ? { quoted: { price: b.close, currency: found.currency } } : {}),
    moment: { asked: at, start: b.start, seconds: b.seconds, low: usd(b.low), high: usd(b.high), inside: found.inside },
  }
}

// ---------------------------------------------------------------- now

async function liveNow(
  item: { ticker: string; assetClass: AssetClass; venue?: string | null },
  today: string,
  money: { code: string; rate: number }
): Promise<Found | { note: string } | null> {
  const venue = kindOf(item.assetClass) === 'crypto' ? cryptoVenue(item.venue) : null
  if (venue) {
    const found = await venueQuote(venue.id, item.ticker)
    if (found.status === 'ok') {
      return {
        ok: true,
        price: found.quote.price,
        date: today,
        basis: 'live',
        source: found.quote.source!,
        ...(showable(venue.quote) ? { quoted: found.local } : {}),
        ...(found.conversion.note ? { note: found.conversion.note } : {}),
      }
    }
    // The automatic price follows, saying why.
    const why =
      found.status === 'unlisted'
        ? `${venue.name} doesn’t list ${item.ticker}/${venue.quote}`
        : `${venue.name} didn’t answer just now`
    const auto = await liveNow({ ...item, venue: null }, today, money)
    return auto && 'ok' in auto ? { ...auto, note: `${why}, so this is the automatic price.` } : { note: why }
  }

  const key = priceKey(item.ticker, item.assetClass)
  const live = (await withDirectQuotes([item], await getAssetQuotes([item]), money))[key]
  // A saved price is no live price: the caller falls through to the latest close.
  if (!live || !(live.price > 0) || !live.source || live.source.saved) return null
  let quoted: { price: number; currency: string } | undefined
  if (live.source.pair) quoted = { price: live.price * money.rate, currency: money.code }
  else if (live.source.currency && isCurrency(live.source.currency)) {
    // A share listed abroad: its price as the market quotes it.
    const rate = await getRate(live.source.currency)
    if (rate) quoted = { price: live.price * rate.rate, currency: live.source.currency }
  }
  return { ok: true, price: live.price, date: today, basis: 'live', source: live.source, ...(quoted ? { quoted } : {}) }
}

// ---------------------------------------------------------------- a day's close

async function venueClose(venue: CryptoVenue, coin: string, date: string, now: number, today: string): Promise<Found | null> {
  const bars = await dailyBars(venue, coin, date, now)
  const close = closeOnOrBefore(
    bars.map((b) => ({ date: barDate(b), close: b.close })),
    date
  )
  if (!close) return null
  const conversion = await conversionAt(venue.quote, utcSeconds(close.date) + 86_399, now, today)
  if (!conversion) return null
  return {
    ok: true,
    price: close.close * conversion.usd,
    date: close.date,
    basis: 'close',
    source: venueSource(venue, coin),
    ...(showable(venue.quote) ? { quoted: { price: close.close, currency: venue.quote } } : {}),
    ...(conversion.note ? { note: conversion.note } : {}),
  }
}

async function listedClose(item: { ticker: string; assetClass: AssetClass }, date: string, today: string): Promise<Found | null> {
  const metal = kindOf(item.assetClass) === 'metal'
  const symbol = metal ? METAL_FUTURES[item.ticker] : item.ticker
  if (!symbol) return null
  const from = utcSeconds(shiftDate(date, -(MAX_DAYS_BACK + 2)))
  const to = utcSeconds(shiftDate(date, 2))
  const { closes, currency } = await yahooDailyCloses(symbol, from, to, date >= today)
  const close = closeOnOrBefore(closes, date)
  if (!close) return null
  const code = currency ?? 'USD'
  const rate = await rateOn(code, close.date, today)
  if (rate === null) return null
  const foreign = code !== 'USD' && isCurrency(code)
  return {
    ok: true,
    price: close.close / rate,
    date: close.date,
    basis: 'close',
    source: metal ? YAHOO_FUTURES : foreign ? { ...YAHOO, currency: code } : YAHOO,
    ...(foreign ? { quoted: { price: close.close, currency: code } } : {}),
  }
}

// ---------------------------------------------------------------- all together

/**
 * The price to record a purchase or sale at. `savedCloses` reads FolioQ's own
 * saved daily prices for a key, used when no outside source answers. `at` is
 * the moment it happened (unix seconds), when a time was given.
 */
export async function datedPrice(
  item: { ticker: string; assetClass: AssetClass; venue?: string | null },
  date: string,
  today: string,
  savedCloses: (key: string, from: string, to: string) => Promise<DailyClose[]>,
  /** The display currency and its rate: today's price for a coin may be quoted directly in it. */
  money: { code: string; rate: number } = { code: 'USD', rate: 1 },
  at: number | null = null
): Promise<DatedPrice> {
  const kind = kindOf(item.assetClass)
  if (kind === 'cash') return { ok: false, error: 'Cash has no market price. Edit the amount instead.' }
  const key = priceKey(item.ticker, item.assetClass)
  const venue = kind === 'crypto' ? cryptoVenue(item.venue) : null
  const now = Math.floor(Date.now() / 1000)
  let note: string | undefined

  // At a time of day, unless that is just now.
  if (at !== null && now - at > NOW_SECONDS) {
    let found: Found | null = null
    if (kind === 'crypto') {
      if (venue) {
        found = await venueAt(venue, item.ticker, at, now, today)
        if (!found) note = `${venue.name} has no price for that time, so this is the automatic price`
      }
      if (!found) found = await autoCryptoAt(item.ticker, at, now, today)
    } else {
      found = await listedAt(item, at, now, today)
    }
    if (found) return note ? { ...found, note: found.note ? `${note}. ${found.note}` : `${note}.` } : found
    note = 'No price for that time was found, so this is the day’s close.'
  }

  const today_ = date === today || (at !== null && now - at <= NOW_SECONDS)
  if (today_) {
    const live = await liveNow(item, today, money)
    if (live && 'ok' in live) return note ? { ...live, note } : live
    if (live) note = `${live.note}.`
    // No live price right now: the latest close is the next best thing.
  }

  let found: Found | null = null
  if (kind === 'crypto') {
    if (venue) {
      found = await venueClose(venue, item.ticker, date, now, today)
      if (!found) note = `${venue.name} has no daily price for that date, so this is the automatic price.`
    }
    if (!found) {
      const close = await cryptoClose(item.ticker, date)
      if (close) found = { ok: true, price: close.close.close, date: close.close.date, basis: 'close', source: close.source }
    }
  } else if (kind === 'listed' || kind === 'metal') {
    found = await listedClose(item, date, today)
  }

  if (!found) {
    // FolioQ's own saved prices are in US dollars, filed under the asset whatever the exchange.
    const saved = closeOnOrBefore(await savedCloses(key, shiftDate(date, -MAX_DAYS_BACK), date), date)
    if (saved) found = { ok: true, price: saved.close, date: saved.date, basis: 'close', source: SAVED_DAILY }
  }

  if (!found) return { ok: false, error: NO_PRICE }
  return note ? { ...found, note: found.note ? `${note} ${found.note}` : note } : found
}
