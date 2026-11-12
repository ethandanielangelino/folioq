'use client'

import { useId, useRef, useState, useTransition } from 'react'
import {
  addHolding,
  deleteHolding,
  latestPrice,
  suggestSymbols,
  updateHolding,
} from '@/app/dashboard/actions'
import {
  dangerButton,
  dialogPanel,
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
} from '@/app/components/styles'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/app/components/toast'
import type { SymbolMatch } from '@/lib/finnhub'

export interface EditableHolding {
  id: string
  ticker: string
  quantity: number
  costBasis: number | null
  openedAt: string
}

/**
 * Adds a holding, or edits (and can delete) one when `holding` is given.
 */
export default function HoldingDialog({
  portfolioId,
  today,
  holding,
  triggerLabel,
  triggerClassName = primaryButton,
}: {
  portfolioId: string
  /** Today's market date, YYYY-MM-DD, from the server. */
  today: string
  holding?: EditableHolding
  triggerLabel: string
  triggerClassName?: string
}) {
  const editing = Boolean(holding)
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [ticker, setTicker] = useState(holding?.ticker ?? '')
  const [cost, setCost] = useState(holding?.costBasis != null ? String(holding.costBasis) : '')
  const [matches, setMatches] = useState<SymbolMatch[]>([])
  const [error, setError] = useState('')
  const [costHint, setCostHint] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const [fetchingPrice, startPriceLookup] = useTransition()

  const uid = useId()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSearch = useRef(0)

  function reset() {
    setTicker(holding?.ticker ?? '')
    setCost(holding?.costBasis != null ? String(holding.costBasis) : '')
    setMatches([])
    setError('')
    setCostHint('')
    setConfirmingDelete(false)
  }

  function onTickerChange(value: string) {
    setTicker(value.toUpperCase())
    setCostHint('')
    if (searchTimer.current) clearTimeout(searchTimer.current)

    const query = value.trim()
    if (query.length < 1) {
      setMatches([])
      return
    }
    // Wait for a pause in typing, and ignore answers that arrive out of order.
    searchTimer.current = setTimeout(async () => {
      const ticket = ++latestSearch.current
      const results = await suggestSymbols(query)
      if (ticket === latestSearch.current) setMatches(results)
    }, 250)
  }

  function fillLatestPrice() {
    setCostHint('')
    startPriceLookup(async () => {
      const value = await latestPrice(ticker)
      if (value === null) setCostHint('No price found for that ticker.')
      else setCost(String(value))
    })
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError('')

    startTransition(async () => {
      const result = holding
        ? await updateHolding(portfolioId, holding.id, formData)
        : await addHolding(portfolioId, formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast(holding ? `${holding.ticker} updated` : `${String(formData.get('ticker')).toUpperCase()} added`)
    })
  }

  function confirmDelete() {
    if (!holding) return
    setError('')
    startTransition(async () => {
      const result = await deleteHolding(portfolioId, holding.id)
      if (!result.ok) {
        setError(result.error)
        setConfirmingDelete(false)
        return
      }
      setOpen(false)
      toast(`${holding.ticker} deleted`)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        reset()
      }}
    >
      <DialogTrigger
        className={triggerClassName}
        aria-label={editing ? `Edit ${holding?.ticker}` : undefined}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto`}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          {editing ? `Edit ${holding?.ticker}` : 'Add a holding'}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {editing
            ? 'Update the position after you buy more or sell some. FolioQ records it; it doesn’t place orders.'
            : 'Enter a position as it stands today. FolioQ records it; it doesn’t place orders.'}
        </DialogDescription>

        {confirmingDelete && holding ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              Delete {holding.ticker} from this portfolio? Its thesis and every earlier version go
              with it. This can&apos;t be undone.
            </p>
            {error && (
              <p role="alert" className={`mt-4 ${errorText}`}>
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className={outlineButton}
              >
                Keep holding
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className={dangerButton}
              >
                {pending ? 'Deleting…' : 'Delete holding'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
            {!editing && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-ticker`} className={fieldLabel}>
                  Ticker
                </label>
                <input
                  id={`${uid}-ticker`}
                  name="ticker"
                  required
                  maxLength={12}
                  value={ticker}
                  onChange={(e) => onTickerChange(e.target.value)}
                  list={`${uid}-matches`}
                  placeholder="AAPL"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={field}
                />
                <datalist id={`${uid}-matches`}>
                  {matches.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.description}
                    </option>
                  ))}
                </datalist>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-quantity`} className={fieldLabel}>
                  Shares
                </label>
                <input
                  id={`${uid}-quantity`}
                  name="quantity"
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.000001"
                  step="any"
                  defaultValue={holding?.quantity}
                  placeholder="10"
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-cost`} className={fieldLabel}>
                  Average cost per share
                </label>
                <input
                  id={`${uid}-cost`}
                  name="cost_basis"
                  type="number"
                  inputMode="decimal"
                  min="0.0001"
                  step="any"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="150.00"
                  aria-describedby={`${uid}-cost-hint`}
                  className={field}
                />
              </div>
            </div>
            <div className="-mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <span id={`${uid}-cost-hint`} className="text-zinc-500 dark:text-zinc-400">
                {costHint || 'Leave the cost blank if you don’t know it; gain is then left out.'}
              </span>
              <button
                type="button"
                onClick={fillLatestPrice}
                disabled={!ticker.trim() || fetchingPrice}
                className="font-medium text-zinc-700 underline underline-offset-4 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                {fetchingPrice ? 'Fetching price…' : 'Use latest price'}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={`${uid}-opened`} className={fieldLabel}>
                Date opened
              </label>
              <input
                id={`${uid}-opened`}
                name="opened_at"
                required
                type="date"
                max={today}
                defaultValue={holding?.openedAt ?? today}
                className={field}
              />
            </div>

            {error && (
              <p role="alert" className={errorText}>
                {error}
              </p>
            )}

            <div className="mt-1 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setConfirmingDelete(true)
                  }}
                  className="text-sm font-medium text-zinc-500 underline-offset-4 hover:text-red-700 hover:underline sm:mr-auto dark:text-zinc-400 dark:hover:text-red-400"
                >
                  Delete holding
                </button>
              )}
              <DialogClose className={outlineButton}>Cancel</DialogClose>
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? 'Saving…' : editing ? 'Save changes' : 'Add holding'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
