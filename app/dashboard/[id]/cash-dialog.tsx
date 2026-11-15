'use client'

import { useId, useState, useTransition } from 'react'
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { dialogPanel, errorText, field, fieldLabel, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { moveMoney } from '@/app/dashboard/actions'
import { currencyName, inOwn, type CashLine } from '@/app/dashboard/[id]/cash-choice'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CURRENCIES } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { cashCovers } from '@/lib/portfolio'

/** The two buttons on the Cash card. */
export const cashButton =
  'inline-flex items-center gap-1.5 rounded-full border border-black/[.12] px-3.5 py-1.5 text-sm font-medium text-black transition-colors hover:border-black/40 hover:bg-black/[.03] dark:border-white/[.18] dark:text-zinc-50 dark:hover:border-white/50 dark:hover:bg-white/[.05]'

/** What a cash form starts with when the assistant set it up from the owner's message. */
export interface CashInitial {
  currency?: string
  amount?: number
  date?: string
}

/**
 * Puts money into the portfolio's cash, or takes it out, in any currency and
 * on a date. Kept in the cash line's history as a deposit or a withdrawal.
 * Used in its dialog and in the assistant's chat, where it starts from what
 * the owner said and spells out what will be recorded above Confirm.
 */
export function CashForm({
  portfolioId,
  direction,
  cashLines,
  today,
  initial,
  onDone,
  onCancel,
  mode = 'dialog',
}: {
  portfolioId: string
  direction: 'in' | 'out'
  cashLines: CashLine[]
  today: string
  initial?: CashInitial
  onDone: (done: { toast: string; record: string }) => void
  /** Chat only: the dialog has its own Cancel. */
  onCancel?: () => void
  mode?: 'dialog' | 'chat'
}) {
  const adding = direction === 'in'
  const chat = mode === 'chat'
  const money = useMoney()
  const display = money.wanted || money.code
  const uid = useId()
  const funded = cashLines.filter((l) => l.amount > 0)
  const fallback = adding ? display : (funded.find((l) => l.currency === display) ?? funded[0])?.currency ?? display
  // Taking money out is only offered from a line that has some.
  const startCurrency =
    initial?.currency && (adding || funded.some((l) => l.currency === initial.currency)) ? initial.currency : fallback
  const [currency, setCurrency] = useState(startCurrency)
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? today)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const line = cashLines.find((l) => l.currency === currency)
  const value = Number(amount)
  const valid = value > 0 && Number.isFinite(value)
  const tooMuch = !adding && valid && !cashCovers(line?.amount ?? 0, value)
  const after = valid ? (line?.amount ?? 0) + (adding ? value : -value) : null

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await moveMoney(portfolioId, direction, currency, amount, date)
      if (!result.ok) return setError(result.error)
      const said = `${inOwn(value, currency)} ${adding ? 'added to' : 'taken out of'} ${currencyName(currency)} cash`
      startTransition(() => onDone({ toast: said, record: `${said}, on ${formatDate(date)}.` }))
    })
  }

  if (!adding && funded.length === 0) {
    return chat ? (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">This portfolio has no cash to take out.</p>
        <button type="button" onClick={onCancel} className={`${outlineButton} self-start`}>
          Close
        </button>
      </div>
    ) : null
  }

  return (
        <form onSubmit={onSubmit} className={`rise-in flex flex-col gap-5 ${chat ? '' : 'mt-6'}`}>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-currency`} className={fieldLabel}>
              {adding ? 'Currency' : 'From'}
            </label>
            <select id={`${uid}-currency`} value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              {adding
                ? CURRENCIES.map((c) => {
                    const held = cashLines.find((l) => l.currency === c.code)
                    return (
                      <option key={c.code} value={c.code}>
                        {c.name}
                        {held ? ` (${inOwn(held.amount, c.code)} held)` : ''}
                      </option>
                    )
                  })
                : funded.map((l) => (
                    <option key={l.currency} value={l.currency}>
                      {currencyName(l.currency)} cash ({inOwn(l.amount, l.currency)})
                    </option>
                  ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-amount`} className={fieldLabel}>
              Amount in {currency}
            </label>
            <input
              id={`${uid}-amount`}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-date`} className={fieldLabel}>
              Date
            </label>
            <input
              id={`${uid}-date`}
              type="date"
              required
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>

          {valid && (
            <div aria-live="polite" className="rise-in rounded-2xl bg-zinc-100 px-4 py-3 text-sm dark:bg-white/[.05]">
              {tooMuch ? (
                <p className={errorText}>
                  This portfolio has {inOwn(line?.amount ?? 0, currency)} in {currencyName(currency)} cash. Take out less.
                </p>
              ) : (
                <p className="text-zinc-700 dark:text-zinc-300">
                  {currencyName(currency)} cash afterwards:{' '}
                  <span className="font-semibold tabular-nums text-black dark:text-zinc-50">{inOwn(Math.max(0, after ?? 0), currency)}</span>
                </p>
              )}
            </div>
          )}

          {chat && valid && !tooMuch && (
            <p data-testid="action-summary" className="rise-in rounded-2xl border border-mint-600/30 bg-mint-600/[.06] px-4 py-3 text-sm leading-6 text-black dark:border-mint-400/30 dark:bg-mint-400/[.08] dark:text-zinc-50">
              {adding ? 'Add' : 'Take'} {inOwn(value, currency)} {adding ? 'to' : 'out of'} {currencyName(currency)} cash
              {date === today ? ', today' : `, on ${formatDate(date)}`}.
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
            <button type="submit" disabled={pending || !valid || tooMuch} className={primaryButton}>
              {pending ? 'Saving…' : chat ? 'Confirm' : adding ? 'Add money' : 'Take it out'}
            </button>
          </div>
        </form>
  )
}

/** The Add money or Take money out button on the Cash card, and its dialog. */
export default function CashDialog({
  portfolioId,
  direction,
  cashLines,
  today,
}: {
  portfolioId: string
  direction: 'in' | 'out'
  cashLines: CashLine[]
  today: string
}) {
  const adding = direction === 'in'
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const Icon = adding ? ArrowDownToLine : ArrowUpFromLine
  if (!adding && !cashLines.some((l) => l.amount > 0)) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cashButton}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {adding ? 'Add money' : 'Take money out'}
      </DialogTrigger>
      <DialogContent className={dialogPanel}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">{adding ? 'Add money' : 'Take money out'}</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {adding
            ? 'Record money put into this portfolio: savings, a top-up, a dividend paid in cash.'
            : 'Record money taken out of this portfolio and not invested elsewhere in it.'}
        </DialogDescription>
        <CashForm
          portfolioId={portfolioId}
          direction={direction}
          cashLines={cashLines}
          today={today}
          onDone={(done) => {
            setOpen(false)
            toast(done.toast)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
