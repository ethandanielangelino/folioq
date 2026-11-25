'use client'

// Edits one entry in a holding's history: a purchase, a sale, or how the
// holding started. The date, the time and the amount can be corrected (and,
// for something already owned, its average cost). A purchase or sale moved to
// another date or time is priced again there, the same way Buy and Sell price
// one; the server then moves the holding and its cash by what the edit
// changes. The database keeps the entry as it was before.

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { CalendarDays, Pencil } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { dialogPanel, errorText, field, fieldLabel, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { editHistoryEntry, getEntryPrice } from '@/app/dashboard/actions'
import { CurrencySelect, PriceOrigin, moneyCurrencies, shownPrice } from '@/app/dashboard/[id]/amount-choice'
import {
  MomentRange,
  TimeField,
  aheadOfNewYork,
  basisWords,
  inFuture,
  momentOf,
  useLatestDate,
} from '@/app/dashboard/[id]/trade-time'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { METALS, kindOf, unitName } from '@/lib/assets'
import type { DatedPrice } from '@/lib/dated-price'
import { formatDate, formatMoney } from '@/lib/format'
import type { HistoryEntry } from '@/lib/history'

type Quote = { status: 'same' } | { status: 'loading'; asked: string } | { status: 'done'; asked: string; result: DatedPrice }

/** "14:32" for an ISO moment, in the person's own time zone. */
function clockOf(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const WHAT = { opened: 'how it started', bought: 'purchase', sold: 'sale' } as const

export default function EditEntryDialog({
  portfolioId,
  entry,
  today,
}: {
  portfolioId: string
  entry: HistoryEntry
  /** Today in New York, YYYY-MM-DD. */
  today: string
}) {
  const [open, setOpen] = useState(false)
  const name = kindOf(entry.assetClass) === 'metal' ? (METALS[entry.ticker] ?? entry.ticker) : entry.ticker
  const what = entry.kind === 'opened' || entry.kind === 'bought' || entry.kind === 'sold' ? WHAT[entry.kind] : 'entry'
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={`Edit this ${what} of ${name}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-black/[.05] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        Edit
      </DialogTrigger>
      <DialogContent className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto`}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          Edit this {what} of {name}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Correct the date, time or amount. The holding{entry.cashChange !== 0 ? ' and its cash' : ''} change to match, and the history
          keeps how it read before.
        </DialogDescription>
        {open && <EditEntryForm portfolioId={portfolioId} entry={entry} today={today} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function EditEntryForm({
  portfolioId,
  entry,
  today,
  onDone,
}: {
  portfolioId: string
  entry: HistoryEntry
  today: string
  onDone: () => void
}) {
  const money = useMoney()
  const display = money.wanted || money.code
  const toast = useToast()
  const uid = useId()
  const [date, setDate] = useState(entry.tradeDate)
  const [time, setTime] = useState(clockOf(entry.tradedAt))
  const [quantity, setQuantity] = useState(String(entry.quantity))
  // Something already owned was entered with its broker's average cost, kept in US dollars.
  const typedCost = entry.kind === 'opened' && entry.priceSource === null
  const [cost, setCost] = useState(entry.price !== null ? String(Number(entry.price.toPrecision(10))) : '')
  const [costCurrency, setCostCurrency] = useState('USD')
  const [manualPrice, setManualPrice] = useState('')
  const [quote, setQuote] = useState<Quote>({ status: 'same' })
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const asked = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useLatestDate(today)

  // Left as it was, the moment is sent exactly as recorded, wherever it is viewed from.
  const sameAs = (d: string, t: string) => d === entry.tradeDate && t === clockOf(entry.tradedAt)
  const moved = !sameAs(date, time)
  const moment = moved ? momentOf(date, time) : entry.tradedAt
  const timeInFuture = inFuture(moment)
  const needsTime = date > today && !moment
  const key = `${date}|${moment ?? ''}`
  const market = quote.status === 'done' && quote.asked === key && quote.result.ok ? quote.result : null
  const noMarketPrice = quote.status === 'done' && quote.asked === key && !quote.result.ok
  const units = unitName(entry.assetClass, 2)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  /** A purchase or sale moved in time is priced again; until then its price stays. */
  function lookUp(nextDate: string, nextTime: string) {
    if (timer.current) clearTimeout(timer.current)
    const id = ++asked.current
    setManualPrice('')
    const at = momentOf(nextDate, nextTime)
    if (typedCost || sameAs(nextDate, nextTime) || !nextDate || inFuture(at) || (nextDate > today && !at)) {
      setQuote({ status: 'same' })
      return
    }
    const k = `${nextDate}|${at ?? ''}`
    setQuote({ status: 'loading', asked: k })
    timer.current = setTimeout(async () => {
      const result = await getEntryPrice(portfolioId, entry.id, nextDate, at)
      if (id === asked.current) setQuote({ status: 'done', asked: k, result })
    }, 350)
  }

  const qty = Number(quantity)
  const priceReady = typedCost || !moved || market !== null || (noMarketPrice && Number(manualPrice) > 0)
  const ready = qty > 0 && Number.isFinite(qty) && !timeInFuture && !needsTime && !!date && priceReady

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await editHistoryEntry(portfolioId, entry.id, {
        date,
        at: moment,
        quantity,
        ...(typedCost ? { cost, costCurrency } : {}),
        ...(noMarketPrice ? { manualPrice } : {}),
      })
      if (!result.ok) return setError(result.error)
      startTransition(() => {
        onDone()
        toast('Entry updated')
      })
    })
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-date`} className={fieldLabel}>
          Date
        </label>
        <input
          id={`${uid}-date`}
          type="date"
          required
          max={latest}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setError('')
            lookUp(e.target.value, time)
          }}
          className={field}
        />
      </div>

      <TimeField
        id={`${uid}-time`}
        value={time}
        label={entry.kind === 'sold' ? 'Time it filled' : typedCost ? 'Time you bought it' : 'Time it filled'}
        onChange={(next) => {
          setTime(next)
          setError('')
          lookUp(date, next)
        }}
        help={typedCost ? ['Kept in its history.', 'If you know it: kept in its history.'] : undefined}
      />
      {timeInFuture && <p className={errorText}>That time hasn’t happened yet. Check the date and time.</p>}
      {needsTime && !timeInFuture && <p className={errorText}>{aheadOfNewYork(today)}</p>}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-qty`} className={fieldLabel}>
          {entry.kind === 'sold' ? `How many ${units} sold` : entry.kind === 'bought' ? `How many ${units} bought` : `How many ${units} held`}
        </label>
        <input
          id={`${uid}-qty`}
          type="number"
          inputMode="decimal"
          min="0.00000001"
          step="any"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={field}
        />
      </div>

      {typedCost ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-cost`} className={fieldLabel}>
            Average cost per {unitName(entry.assetClass, 1)}
          </label>
          <div className="flex gap-2">
            <input
              id={`${uid}-cost`}
              type="number"
              inputMode="decimal"
              min="0.00000001"
              step="any"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={field}
            />
            <CurrencySelect label="Currency of the average cost" value={costCurrency} onChange={setCostCurrency} options={moneyCurrencies(display)} />
          </div>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Shown in US dollars, as it is kept. {costCurrency !== 'USD' && 'Typed in another currency, it is converted at the rate on that date.'}
          </p>
        </div>
      ) : (
        <div aria-live="polite" className="flex flex-col gap-1.5">
          <p className={fieldLabel}>Price per {unitName(entry.assetClass, 1)}</p>
          {quote.status === 'same' ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {entry.price !== null ? (
                <>
                  <span className="font-semibold tabular-nums text-black dark:text-zinc-50">{formatMoney(entry.price, money)}</span>, as
                  recorded. Change the date or time to price it again there.
                </>
              ) : (
                'No price was recorded.'
              )}
            </p>
          ) : quote.status === 'loading' ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <CalendarDays className="h-4 w-4 animate-pulse" aria-hidden="true" />
              Finding the price on {formatDate(date)}…
            </p>
          ) : market ? (
            <p key={`${market.date}-${market.price}`} className="rise-in text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold tabular-nums text-black dark:text-zinc-50">{shownPrice(market, money)}</span> each:{' '}
              {basisWords(market)}, <PriceOrigin market={market} />. <MomentRange market={market} />
              {entry.price !== null && (
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">Was {formatMoney(entry.price, money)}.</span>
              )}
            </p>
          ) : noMarketPrice ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{quote.status === 'done' && !quote.result.ok ? quote.result.error : ''}</p>
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
            </div>
          ) : null}
        </div>
      )}

      {entry.cashChange !== 0 && (
        <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-white/[.05] dark:text-zinc-400">
          It {entry.kind === 'sold' ? 'paid into' : 'was paid from'} {entry.cashCurrency} cash. That amount is worked out again from the new
          figures, and the cash moves by the difference.
        </p>
      )}

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}

      <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <DialogClose className={outlineButton}>Cancel</DialogClose>
        <button type="submit" disabled={pending || !ready} className={primaryButton}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
