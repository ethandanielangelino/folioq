'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { ArrowRight, Banknote, CalendarDays } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { dialogPanel, errorText, field, fieldLabel, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { buyMore, getTradePrice, sellHolding, type Side } from '@/app/dashboard/actions'
import {
  CashSelect,
  OUTSIDE,
  currencyName,
  defaultPayFrom,
  inOwn,
  intoOptions,
  useRate,
  type CashLine,
} from '@/app/dashboard/[id]/cash-choice'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { METALS, kindOf, unitName, type AssetClass } from '@/lib/assets'
import { formatDate, formatDayDate, formatMoney, formatShares } from '@/lib/format'
import { cashCovers, planBuy, planSale, unitsForMoney } from '@/lib/portfolio'
import {
  EnterBySwitch,
  MoneyInput,
  PriceOrigin,
  moneyCurrencies,
  shownPrice,
  type EnterBy,
} from '@/app/dashboard/[id]/amount-choice'
import { saleDateProblem } from '@/lib/sale-date'
import type { DatedPrice } from '@/lib/dated-price'
import Delta from '@/app/components/portfolio/delta'
import { MomentRange, TimeField, aheadOfNewYork, basisWords, inFuture, momentOf, useLatestDate } from '@/app/dashboard/[id]/trade-time'

export interface TradableHolding {
  id: string
  ticker: string
  assetClass: AssetClass
  quantity: number
  costBasis: number | null
  /** YYYY-MM-DD: a sale can't be before this. */
  openedAt: string
}

/** `asked` is the date and the moment (if a time was given) the price is for. */
type Quote = { status: 'idle' } | { status: 'loading'; asked: string } | { status: 'done'; asked: string; result: DatedPrice }

const askedFor = (date: string, moment: string | null) => `${date}|${moment ?? ''}`

/** Today where the person is, YYYY-MM-DD. Only read once the dialog is open, in the browser. */
function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const choice = (on: boolean) =>
  `shrink-0 rounded-2xl border px-4 text-sm font-medium transition-colors ${
    on
      ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
      : 'border-black/[.1] text-zinc-700 hover:border-black/30 dark:border-white/[.15] dark:text-zinc-300'
  }`

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1)

/** Shown in the preview: a line with a lead-in and a figure. */
function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-600 dark:text-zinc-400">{children}</p>
}

/** The Buy and Sell buttons on a holding: clear, but quieter than the page's main button. */
export const tradeButton =
  'rounded-full border border-black/[.12] px-3 py-1 text-xs font-medium text-black transition-colors hover:border-black/40 hover:bg-black/[.03] dark:border-white/[.18] dark:text-zinc-50 dark:hover:border-white/50 dark:hover:bg-white/[.05]'

/**
 * Buys more of a holding, or sells some or all of it. You say when and how
 * much; the price is the market's on that day (live for today, else that
 * day's close), so no one types a price in unless no source has one. A sale's
 * money goes into the cash line you choose; a purchase can be paid from one.
 */
/** What a trade form starts with when the assistant set it up from the owner's message. */
export interface TradeInitial {
  quantity?: number
  all?: boolean
  spend?: { amount: number; currency: string }
  date?: string
  /** Buying: a cash currency to pay from, or '' for money from outside FolioQ. */
  payFrom?: string
  /** Selling: the cash currency the money goes into. */
  into?: string
}

/** Told to whoever opened the form once it has saved: a short confirmation, and the record in words. */
export type TradeDone = { toast: string; record: string }

/**
 * The Buy or Sell form for one holding. Used in its dialog, and in the
 * assistant's chat, where it starts from what the owner already said, asks for
 * the rest, and spells out what will be recorded right above Confirm.
 */
export function TradeForm({
  side,
  portfolioId,
  holding,
  today,
  cashLines,
  initial,
  onDone,
  onCancel,
  mode = 'dialog',
}: {
  side: Side
  portfolioId: string
  holding: TradableHolding
  /** Today in New York, YYYY-MM-DD. */
  today: string
  /** The portfolio's cash, which a purchase can be paid from and a sale paid into. */
  cashLines: CashLine[]
  initial?: TradeInitial
  onDone: (done: TradeDone) => void
  /** Chat only: the dialog has its own Cancel. */
  onCancel?: () => void
  mode?: 'dialog' | 'chat'
}) {
  const buying = side === 'buy'
  const chat = mode === 'chat'
  const money = useMoney()
  const display = money.wanted || money.code
  const uid = useId()
  // A sale in the dialog starts at all of it; in the chat only when the owner said so.
  const startQuantity = initial?.all
    ? String(holding.quantity)
    : initial?.quantity
      ? String(initial.quantity)
      : buying || chat
        ? ''
        : String(holding.quantity)
  const startDate = initial?.date ?? today
  const [quantity, setQuantity] = useState(startQuantity)
  const [date, setDate] = useState(startDate)
  // The time of day the order filled, in the person's time zone; blank for the day's price.
  const [fillTime, setFillTime] = useState('')
  // Null until the person chooses: until then it follows the defaults, even if
  // the cash figures arrive after the dialog opened.
  const [payChoice, setPayChoice] = useState<string | null>(initial?.payFrom ?? null)
  const [intoChoice, setIntoChoice] = useState<string | null>(initial?.into ?? null)
  const [manualPrice, setManualPrice] = useState('')
  const [quote, setQuote] = useState<Quote>({ status: 'loading', asked: askedFor(startDate, null) })
  // A purchase can be entered as the money spent; FolioQ works out how many.
  const [enterBy, setEnterBy] = useState<EnterBy>(buying && initial?.spend ? 'money' : 'units')
  const [spend, setSpend] = useState(initial?.spend ? String(initial.spend.amount) : '')
  const [spendChoice, setSpendChoice] = useState<string | null>(initial?.spend?.currency ?? null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  // Only the answer for the latest date counts; a slower, older one is ignored.
  const asked = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const name = kindOf(holding.assetClass) === 'metal' ? (METALS[holding.ticker] ?? holding.ticker) : holding.ticker
  const units = unitName(holding.assetClass, 2)
  const unit = unitName(holding.assetClass, 1)
  // With a time, the date may be the person's own, a day ahead of New York.
  const latest = useLatestDate(today)
  const rulesFor = (time: string) => ({ openedAt: buying ? '1970-01-01' : holding.openedAt, today: time ? latest : today })
  const dateRules = rulesFor('')

  const payFrom = buying ? (payChoice ?? defaultPayFrom(cashLines, display)) : OUTSIDE
  const into = buying ? null : (intoChoice ?? display)
  const cashCurrency = buying ? (payFrom === OUTSIDE ? null : payFrom) : into
  const rate = useRate(cashCurrency, date)

  const dateProblem =
    date > today && !fillTime && date <= latest ? aheadOfNewYork(today) : saleDateProblem(date, rulesFor(fillTime))
  const moment = momentOf(date, fillTime)
  const timeInFuture = inFuture(moment)
  const now = askedFor(date, moment)
  const market = quote.status === 'done' && quote.asked === now && quote.result.ok ? quote.result : null
  const noMarketPrice = quote.status === 'done' && quote.asked === now && !quote.result.ok
  const typed = Number(manualPrice)
  const typedPrice = noMarketPrice && typed > 0 && Number.isFinite(typed) ? typed : null
  const price = market?.price ?? typedPrice

  // Bought by money spent: in the paying cash's currency, or yours.
  const byMoney = buying && enterBy === 'money'
  const spendCurrency = cashCurrency ?? spendChoice ?? display
  const ownSpendRate = useRate(byMoney && cashCurrency === null ? spendCurrency : null, date)
  const spendRate = cashCurrency !== null ? rate : ownSpendRate
  const spent = Number(spend)
  const qty = byMoney
    ? (price !== null && typeof spendRate === 'number' ? unitsForMoney(spent, spendRate, price) : null) ?? 0
    : Number(quantity)
  const validQty = qty > 0 && Number.isFinite(qty)
  const tooMany = !buying && validQty && qty > holding.quantity * (1 + 1e-9)
  const sale = !buying && price !== null && validQty && !tooMany ? planSale(holding, qty, price) : null
  const buy = buying && price !== null && validQty ? planBuy(holding, qty, price) : null

  // The money in the chosen cash line's own currency.
  const line = cashLines.find((l) => l.currency === cashCurrency)
  const usd = buy?.cost ?? sale?.proceeds ?? null
  const inCash =
    usd !== null && typeof rate === 'number' ? (byMoney && cashCurrency !== null ? spent : usd * rate) : null
  const shortOfCash = buying && payFrom !== OUTSIDE && inCash !== null && !cashCovers(line?.amount ?? 0, inCash)
  const ready =
    !timeInFuture &&
    (buying ? buy !== null && !shortOfCash : sale !== null) &&
    (cashCurrency === null || typeof rate === 'number')

  function lookUp(next: string, time: string, wait: number) {
    if (timer.current) clearTimeout(timer.current)
    const id = ++asked.current
    const at = momentOf(next, time)
    if (saleDateProblem(next, rulesFor(time)) || inFuture(at)) {
      setQuote({ status: 'idle' })
      return
    }
    const key = askedFor(next, at)
    setQuote({ status: 'loading', asked: key })
    // A short wait while the date or time is still being typed, digit by digit.
    timer.current = setTimeout(async () => {
      const result = await getTradePrice(portfolioId, holding.id, next, side, at)
      if (id === asked.current) setQuote({ status: 'done', asked: key, result })
    }, wait)
  }

  // The price for the starting date, looked up once when the form opens.
  useEffect(() => {
    const id = ++asked.current
    if (saleDateProblem(startDate, dateRules)) {
      timer.current = setTimeout(() => setQuote({ status: 'idle' }), 0)
    } else {
      timer.current = setTimeout(async () => {
        const result = await getTradePrice(portfolioId, holding.id, startDate, side)
        if (id === asked.current) setQuote({ status: 'done', asked: askedFor(startDate, null), result })
      }, 0)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // Once, for the date it started with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeDate(next: string) {
    setDate(next)
    setError('')
    setManualPrice('')
    lookUp(next, fillTime, 350)
  }

  function changeTime(next: string) {
    setFillTime(next)
    setError('')
    setManualPrice('')
    lookUp(date, next, 350)
  }

  /** " at 4:32 PM", when a time was given. */
  const atText = moment ? ` at ${new Date(moment).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const typedIn = noMarketPrice ? manualPrice : undefined
    startTransition(async () => {
      if (buying) {
        const result = await buyMore(portfolioId, holding.id, byMoney ? '' : quantity, date, {
          payFrom: payFrom === OUTSIDE ? null : payFrom,
          manualPrice: typedIn,
          at: moment,
          ...(byMoney ? { spend: { amount: spend, currency: spendCurrency } } : {}),
        })
        if (!result.ok) return setError(result.error)
        const said = `Bought ${formatShares(result.quantity)} ${name} for ${
          result.paidFrom ? `${inOwn(result.paidAmount, result.paidFrom)}, paid from cash` : formatMoney(result.cost, money)
        }`
        // Close (and confirm) in the same transition as the refreshed page, so the
        // dialog stays on "Recording…" until the new numbers are showing.
        startTransition(() =>
          onDone({ toast: said, record: `${said}, on ${formatDate(date)}${atText}, at ${formatMoney(result.price, money)} each.` })
        )
        return
      }
      const result = await sellHolding(portfolioId, holding.id, quantity, date, {
        into: into ?? 'USD',
        manualPrice: typedIn,
        at: moment,
      })
      if (!result.ok) return setError(result.error)
      const said = `Sold ${result.sellsAll ? `all of ${name}` : `${formatShares(qty)} ${name}`} for ${inOwn(result.intoAmount, result.into)}`
      startTransition(() =>
        onDone({
          toast: said,
          record: `${said}, into ${currencyName(result.into)} cash, on ${formatDate(date)}${atText}, at ${formatMoney(result.price, money)} each.`,
        })
      )
    })
  }

  /** What will be recorded, in words, shown above Confirm in the chat. */
  function preview(): string {
    const when = `${date === today ? 'today' : `on ${formatDate(date)}`}${atText}`
    const each = market ? ` at ${shownPrice(market, money)} each` : price !== null ? ` at ${formatMoney(price, money)} each` : ''
    if (buying) {
      const amount = byMoney ? `${inOwn(spent, spendCurrency)} of ${name} (about ${formatShares(qty)} ${units})` : `${formatShares(qty)} ${qty === 1 ? unit : units} of ${name}`
      const paid = payFrom === OUTSIDE ? ', paid with money from outside FolioQ' : `, paid from ${currencyName(payFrom)} cash`
      return `Buy ${amount} ${when}${each}${paid}.`
    }
    const amount = sale?.sellsAll ? `all ${formatShares(qty)} ${units} of ${name}` : `${formatShares(qty)} ${qty === 1 ? unit : units} of ${name}`
    const proceeds = inCash !== null && into ? ` for ${inOwn(inCash, into)}` : ''
    return `Sell ${amount} ${when}${each}${proceeds}, into ${currencyName(into ?? 'USD')} cash.`
  }

  return (
        <form onSubmit={onSubmit} className={`rise-in flex flex-col gap-5 ${chat ? '' : 'mt-6'}`}>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`${uid}-date`} className={fieldLabel}>
                {buying ? 'When did you buy?' : 'When did you sell?'}
              </label>
              {!buying && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Bought {formatDate(holding.openedAt)}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                id={`${uid}-date`}
                type="date"
                required
                min={buying ? undefined : holding.openedAt}
                max={latest}
                value={date}
                onChange={(e) => changeDate(e.target.value)}
                aria-invalid={dateProblem !== null && date !== ''}
                className={field}
              />
              <button type="button" onClick={() => changeDate(today)} aria-pressed={date === today} className={choice(date === today)}>
                Today
              </button>
            </div>
            {localDate() !== today && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Dates follow New York, where US markets trade: it is {formatDate(today)} there now. Your own date works too once you
                add the time it filled.
              </p>
            )}
          </div>

          <TimeField id={`${uid}-time`} value={fillTime} onChange={changeTime} />
          {timeInFuture && <p className={errorText}>That time hasn’t happened yet. Check the date and time.</p>}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <label htmlFor={`${uid}-${byMoney ? 'spend' : 'qty'}`} className={fieldLabel}>
                {buying ? 'How much did you buy?' : 'How much did you sell?'}
              </label>
              {buying ? (
                <EnterBySwitch
                  value={enterBy}
                  onChange={(next) => {
                    setEnterBy(next)
                    setError('')
                  }}
                  unitsLabel={units.charAt(0).toUpperCase() + units.slice(1)}
                  moneyLabel="Money spent"
                />
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  You hold {formatShares(holding.quantity)} {units}
                </span>
              )}
            </div>
            {byMoney ? (
              <div key="money" className="rise-in flex flex-col gap-2">
                <MoneyInput
                  id={`${uid}-spend`}
                  value={spend}
                  onChange={setSpend}
                  currency={spendCurrency}
                  currencies={cashCurrency !== null ? [cashCurrency] : moneyCurrencies(display)}
                  onCurrency={setSpendChoice}
                />
                <p aria-live="polite" data-testid="units-worked-out" className="text-sm text-zinc-600 dark:text-zinc-400">
                  {!(spent > 0) ? (
                    `Enter what you paid and FolioQ works out how many ${units} at the price on that day.`
                  ) : qty > 0 ? (
                    <>
                      That buys about{' '}
                      <span className="font-semibold tabular-nums text-black dark:text-zinc-50">
                        {formatShares(qty)} {qty === 1 ? unit : units}
                      </span>
                      .
                    </>
                  ) : spendRate === null ? (
                    <span className={errorText}>
                      No {currencyName(spendCurrency)} exchange rate for that date. Choose US dollars.
                    </span>
                  ) : (
                    `How many ${units} follows once the price is found.`
                  )}
                </p>
              </div>
            ) : (
            <div className="flex gap-2">
              <input
                id={`${uid}-qty`}
                type="number"
                inputMode="decimal"
                min="0.00000001"
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={buying ? '10' : undefined}
                className={field}
              />
              {!buying && (
                <button
                  type="button"
                  onClick={() => setQuantity(String(holding.quantity))}
                  aria-pressed={qty === holding.quantity}
                  className={choice(qty === holding.quantity)}
                >
                  All
                </button>
              )}
            </div>
            )}
          </div>

          {/* The price: looked up from the date, not typed in. */}
          <div aria-live="polite" className="flex flex-col gap-1.5" data-testid="trade-price">
            <p className={fieldLabel}>Price per {unit}</p>
            {dateProblem && date !== '' ? (
              <p className={errorText}>{dateProblem}</p>
            ) : quote.status === 'loading' || quote.status === 'idle' ? (
              <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <CalendarDays className="h-4 w-4 animate-pulse" aria-hidden="true" />
                Finding the price{date ? ` on ${formatDate(date)}` : ''}…
              </p>
            ) : market ? (
              <div key={`${market.date}-${market.price}`} className="rise-in flex flex-col gap-1">
                <p className="text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">
                  {shownPrice(market, money)}
                </p>
                <p data-testid="price-origin" className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {market.basis === 'live'
                    ? 'Live price now'
                    : market.basis === 'moment'
                      ? capitalised(basisWords(market))
                      : market.date === date
                        ? `Closing price on ${formatDayDate(market.date)}`
                        : `Markets were closed on ${formatDayDate(date)}, so this is the last close before it, on ${formatDayDate(market.date)}`}
                  , <PriceOrigin market={market} />. <MomentRange market={market} />
                </p>
              </div>
            ) : quote.status === 'done' && !quote.result.ok ? (
              // No source has a price: the only time one may be typed in.
              <div className="rise-in flex flex-col gap-2">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{quote.result.error}</p>
                <label htmlFor={`${uid}-manual`} className="text-sm text-zinc-700 dark:text-zinc-300">
                  Or enter the price you got, in US$
                </label>
                <input
                  id={`${uid}-manual`}
                  type="number"
                  inputMode="decimal"
                  min="0.00000001"
                  step="any"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className={field}
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  The history will show it was entered by hand.
                </p>
              </div>
            ) : null}
          </div>

          {buying ? (
            cashLines.some((l) => l.amount > 0) && (
              <CashSelect
                id={`${uid}-pay`}
                label="Pay with"
                value={payFrom}
                onChange={setPayChoice}
                options={cashLines.filter((l) => l.amount > 0).map((l) => l.currency)}
                lines={cashLines}
                outside="Money from outside FolioQ"
              />
            )
          ) : (
            <CashSelect
              id={`${uid}-into`}
              label="Put the money into"
              value={into ?? display}
              onChange={setIntoChoice}
              options={intoOptions(cashLines, display)}
              lines={cashLines}
            />
          )}

          {/* What will happen, before anything does. */}
          {(sale || buy || tooMany) && (
            <div className="rise-in rounded-2xl bg-zinc-100 px-4 py-4 text-sm dark:bg-white/[.05]">
              {tooMany ? (
                <p className={errorText}>
                  You only hold {formatShares(holding.quantity)} {units}.
                </p>
              ) : sale ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-black dark:text-zinc-50">
                    <Banknote className="h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                    <span>
                      You receive{' '}
                      <span className="font-semibold tabular-nums">
                        {inCash !== null && into ? inOwn(inCash, into) : formatMoney(sale.proceeds, money)}
                      </span>
                      <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 -translate-y-px text-zinc-400" aria-hidden="true" />
                      {currencyName(into ?? 'USD')} cash
                    </span>
                  </p>
                  {into && into !== 'USD' && rate === null && (
                    <p className={errorText}>No {currencyName(into)} exchange rate for that date. Choose US dollar cash.</p>
                  )}
                  {sale.realizedGain !== null && (
                    <Line>
                      Gain on what you sell: <Delta amount={sale.realizedGain} className="font-medium" />
                    </Line>
                  )}
                  <Line>
                    {sale.sellsAll
                      ? `This sells all of it: ${name} and its thesis are removed from the portfolio.`
                      : `${formatShares(sale.remaining)} ${units} stay in the portfolio at the same average cost.`}
                  </Line>
                </div>
              ) : buy ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-black dark:text-zinc-50">
                    <Banknote className="h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                    <span>
                      It costs{' '}
                      <span className="font-semibold tabular-nums">
                        {payFrom !== OUTSIDE && inCash !== null ? inOwn(inCash, payFrom) : formatMoney(buy.cost, money)}
                      </span>
                      {payFrom !== OUTSIDE && !shortOfCash && <>, from {currencyName(payFrom)} cash</>}
                    </span>
                  </p>
                  {shortOfCash ? (
                    <p className={errorText}>
                      This portfolio has {inOwn(line?.amount ?? 0, payFrom)} in {currencyName(payFrom)} cash. Buy less, or
                      pay another way.
                    </p>
                  ) : payFrom !== OUTSIDE && inCash !== null ? (
                    <Line>
                      Cash left afterwards:{' '}
                      <span className="font-medium tabular-nums">{inOwn(Math.max(0, (line?.amount ?? 0) - inCash), payFrom)}</span>
                    </Line>
                  ) : payFrom === OUTSIDE ? (
                    <Line>Your cash in FolioQ stays as it is.</Line>
                  ) : null}
                  <Line>
                    You will hold {formatShares(buy.quantity)} {units}
                    {buy.costBasis !== null && holding.costBasis !== null ? (
                      <>
                        , at an average cost of{' '}
                        <span className="font-medium tabular-nums">{formatMoney(buy.costBasis, money)}</span> (was{' '}
                        {formatMoney(holding.costBasis, money)}).
                      </>
                    ) : (
                      '. The average cost stays unknown, as the earlier cost isn’t on record.'
                    )}
                  </Line>
                </div>
              ) : null}
            </div>
          )}

          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Prices are estimates from public market data and may differ from the price you actually
            got. Other currencies use that day&apos;s exchange rate. FolioQ doesn&apos;t place the order for you.
          </p>

          {/* In the chat, exactly what will be recorded, right above Confirm. */}
          {chat && ready && (
            <p data-testid="action-summary" className="rise-in rounded-2xl border border-mint-600/30 bg-mint-600/[.06] px-4 py-3 text-sm leading-6 text-black dark:border-mint-400/30 dark:bg-mint-400/[.08] dark:text-zinc-50">
              {preview()}
            </p>
          )}

          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {chat ? (
              <button type="button" onClick={onCancel} disabled={pending} className={outlineButton}>
                Cancel
              </button>
            ) : (
              <DialogClose className={outlineButton}>Cancel</DialogClose>
            )}
            <button type="submit" disabled={pending || !ready} className={primaryButton}>
              {pending
                ? buying
                  ? 'Recording the purchase…'
                  : 'Recording the sale…'
                : chat
                  ? 'Confirm'
                  : buying
                    ? `Buy ${name}`
                    : sale?.sellsAll
                      ? `Sell all of ${name}`
                      : `Sell ${name}`}
            </button>
          </div>
        </form>
  )
}

/** A holding's Buy or Sell button and its dialog. The form inside starts fresh each time it opens. */
export default function TradeDialog({
  side,
  portfolioId,
  holding,
  today,
  cashLines,
  triggerClassName = tradeButton,
}: {
  side: Side
  portfolioId: string
  holding: TradableHolding
  /** Today in New York, YYYY-MM-DD. */
  today: string
  /** The portfolio's cash, which a purchase can be paid from and a sale paid into. */
  cashLines: CashLine[]
  triggerClassName?: string
}) {
  const buying = side === 'buy'
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const name = kindOf(holding.assetClass) === 'metal' ? (METALS[holding.ticker] ?? holding.ticker) : holding.ticker
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClassName} aria-label={`${buying ? 'Buy more' : 'Sell'} ${name}`}>
        {buying ? 'Buy' : 'Sell'}
      </DialogTrigger>
      <DialogContent className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto`}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          {buying ? `Buy more ${name}` : `Sell ${name}`}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {buying
            ? 'Record a purchase you have made. It is priced at the market on the day you bought.'
            : 'Record a sale you have made. It is valued at the market price on the day you sold, and the money goes into the cash you choose.'}
        </DialogDescription>
        <TradeForm
          side={side}
          portfolioId={portfolioId}
          holding={holding}
          today={today}
          cashLines={cashLines}
          onDone={(done) => {
            setOpen(false)
            toast(done.toast)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
