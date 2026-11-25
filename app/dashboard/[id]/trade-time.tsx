'use client'

// The parts of a purchase or sale that say exactly where and when it
// happened: the time of day an order filled, the exchange a coin was bought
// on, and the market a share is listed on. Shared by Add a holding, Buy and
// Sell, and a holding's Edit.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { field, fieldLabel } from '@/app/components/styles'
import { inOwn } from '@/app/dashboard/[id]/cash-choice'
import { getExchanges } from '@/app/dashboard/actions'
import { isCurrency } from '@/lib/currency'
import type { DatedPrice } from '@/lib/dated-price'
import { formatDate, formatDayDate, formatMoney } from '@/lib/format'
import type { VenueOption } from '@/lib/venue-prices'
import { CRYPTO_VENUES, STOCK_MARKETS, cryptoVenue, historyWords } from '@/lib/venues'

type Market = Extract<DatedPrice, { ok: true }>

// ---------------------------------------------------------------- the time an order filled

/** The person's own time zone, e.g. "Asia/Singapore". Read in the browser only. */
export function useTimeZone(): string {
  const [zone, setZone] = useState('')
  useEffect(() => {
    // Read after the first paint, so the server's render and the browser's agree.
    const id = setTimeout(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''), 0)
    return () => clearTimeout(id)
  }, [])
  return zone
}

/**
 * The latest date a trade can be given on: New York's today (where FolioQ
 * counts dates), or the person's own date when it is already tomorrow there.
 * The person's date is only allowed with a time, which the server checks
 * against now. Read in the browser after the first paint.
 */
export function useLatestDate(today: string): string {
  const [latest, setLatest] = useState(today)
  useEffect(() => {
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const id = setTimeout(() => setLatest(local > today ? local : today), 0)
    return () => clearTimeout(id)
  }, [today])
  return latest
}

/** Said when a date is the person's own, ahead of New York, and no time was given. */
export const aheadOfNewYork = (today: string) =>
  `In New York, where FolioQ counts dates, it is still ${formatDate(today)}. Add the time it filled, or pick that date.`

/**
 * The moment a date and a time of day (as typed, in the person's own time
 * zone) stand for, as an ISO timestamp. Null without a time, or if it can't be read.
 */
export function momentOf(date: string, time: string): string | null {
  if (!date || !time) return null
  const at = new Date(`${date}T${time}`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** Whether a date and time typed are later than now (with a minute's grace). */
export function inFuture(moment: string | null): boolean {
  return moment !== null && Date.parse(moment) > Date.now() + 60_000
}

/**
 * The optional time an order filled. Blank keeps the day's price (the close,
 * or the live price today); a time gets the price at that moment.
 */
export function TimeField({
  id,
  value,
  onChange,
  label = 'Time it filled',
  help,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  label?: string
  /** What the time is for, when it isn't to price a trade: [with a time, without one]. */
  help?: [string, string]
}) {
  const zone = useTimeZone()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={fieldLabel}>
          {label} <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
        </label>
        {zone && <span className="text-xs text-zinc-500 dark:text-zinc-400">Your time, {zone.replace(/_/g, ' ')}</span>}
      </div>
      <div className="flex gap-2">
        <div className="relative w-full">
          <Clock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
          <input
            id={id}
            type="time"
            step={60}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${field} pl-10`}
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear the time"
            className="shrink-0 rounded-2xl border border-black/[.1] px-3 text-zinc-500 transition-colors hover:border-black/30 hover:text-black dark:border-white/[.15] dark:hover:border-white/40 dark:hover:text-zinc-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {help
          ? help[value ? 0 : 1]
          : value
            ? 'FolioQ finds the price at that moment, from the exchange’s record of trades.'
            : 'From your order confirmation. Without it, the day’s closing price is used (the live price for today).'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- what a price at a moment means

const time = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** "minute", "5 minutes", "hour". */
function stretch(seconds: number): string {
  if (seconds <= 60) return 'minute'
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  return 'hour'
}

/**
 * What a looked-up price is, in words to follow the price: "the live price
 * now", "the close on Fri, Mar 13, 2026", "the price at 4:32 PM on Sun, 15
 * Mar 2026", or the last trade before a moment when the market was shut.
 */
export function basisWords(market: Market): string {
  if (market.basis === 'live') return 'the live price now'
  if (market.basis === 'close' || !market.moment) return `the close on ${formatDayDate(market.date)}`
  const m = market.moment
  if (!m.inside) {
    return `the last price before that time (nothing traded then): the ${stretch(m.seconds)} from ${time(m.start)} on ${day(m.start)}`
  }
  if (m.seconds <= 60) return `the price at ${time(m.asked)} on ${day(m.asked)}`
  return `the price in the ${stretch(m.seconds)} from ${time(m.start)} on ${day(m.start)} (finer prices aren’t kept that far back)`
}

/**
 * The range traded in the bar the price came from, so the movement around
 * the moment is plain to see: "That minute it traded between S$89,120 and S$89,410."
 */
export function MomentRange({ market }: { market: Market }) {
  const money = useMoney()
  const m = market.moment
  if (market.basis !== 'moment' || !m || !(m.high > m.low)) return null
  // In the currency the price is shown in: as quoted, or US dollars converted.
  const factor = market.quoted ? market.quoted.price / market.price : null
  const show = (usd: number) => (factor && market.quoted ? inOwn(usd * factor, market.quoted.currency) : formatMoney(usd, money))
  return (
    <span>
      That {stretch(m.seconds)} it traded between <span className="tabular-nums">{show(m.low)}</span> and{' '}
      <span className="tabular-nums">{show(m.high)}</span>.
    </span>
  )
}

// ---------------------------------------------------------------- the exchange a coin was bought on

type Options = { coin: string; list: VenueOption[] | null }

/**
 * Which exchanges trade a coin, with their live prices, fetched once the coin
 * has been typed. Null while it is being checked.
 */
export function useExchanges(coin: string): VenueOption[] | null {
  const [found, setFound] = useState<Options>({ coin: '', list: null })
  const asked = useRef(0)
  const symbol = coin.trim().toUpperCase()
  useEffect(() => {
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return
    const ticket = ++asked.current
    const id = setTimeout(async () => {
      const list = await getExchanges(symbol)
      if (ticket === asked.current) setFound({ coin: symbol, list })
    }, 400)
    return () => clearTimeout(id)
  }, [symbol])
  return found.coin === symbol ? found.list : null
}

/** A price in an exchange's quote currency: in its own currency where FolioQ has one, else "60,610.41 USDT". */
function quoteAmount(price: number, quote: string): string {
  if (isCurrency(quote)) return inOwn(price, quote)
  return `${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 6 : 2 })} ${quote}`
}

/**
 * Picks the exchange a coin is priced on. Automatic (Coinbase, then Kraken)
 * is first and the default; the rest are the exchanges that trade the coin,
 * each with its price there now, so the right one is easy to recognise.
 */
export function ExchangePicker({
  id,
  coin,
  value,
  onChange,
  label = 'Exchange you bought on',
}: {
  id: string
  coin: string
  /** A venue id, or '' for automatic. */
  value: string
  onChange: (next: string) => void
  label?: string
}) {
  const options = useExchanges(coin)
  const symbol = coin.trim().toUpperCase()
  const chosen = cryptoVenue(value)
  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.id, o])), [options])
  // While checking, every exchange is listed; once known, only the ones that trade the coin (and the one chosen).
  const shown = CRYPTO_VENUES.filter((v) => options === null || byId.has(v.id) || v.id === value)
  const chosenOption = chosen ? byId.get(chosen.id) : undefined
  const missing = chosen && options !== null && !chosenOption

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="">Automatic (Coinbase, then Kraken)</option>
        {shown.map((v) => {
          const o = byId.get(v.id)
          const where = v.region === 'Global' || v.region === 'United States' || v.region === 'Europe' ? '' : `, ${v.region}`
          const price = o?.price != null ? ` · ${quoteAmount(o.price, v.quote)}` : o && !o.answered ? ' · not answering' : ''
          return (
            <option key={v.id} value={v.id}>
              {v.name}
              {where} · {symbol || 'coin'}/{v.quote}
              {price}
            </option>
          )
        })}
      </select>
      <p aria-live="polite" className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {!symbol
          ? 'Enter the coin to see the exchanges that trade it.'
          : options === null
            ? `Checking which exchanges trade ${symbol}…`
            : missing
              ? `${chosen.name} doesn’t list ${symbol}/${chosen.quote}. Choose another exchange, or Automatic.`
              : chosen
                ? `Priced on ${chosen.name}’s ${symbol}/${chosen.quote} market${chosen.quote === 'USDT' ? ', with USDT counted at its own price in US dollars' : chosen.quote !== 'USD' ? `, converted from ${chosen.quote} at the exchange rate` : ''}. ${historyWords(chosen)}.`
                : `${options.length} exchange${options.length === 1 ? '' : 's'} trade${options.length === 1 ? 's' : ''} ${symbol}. Pick yours so its price matches what you see there.`}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- the market a share is listed on

/** Picks the stock market a share is listed on. The US is first and the default. */
export function MarketPicker({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={fieldLabel}>
        Market it trades on
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {STOCK_MARKETS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.currency}
          </option>
        ))}
      </select>
    </div>
  )
}
