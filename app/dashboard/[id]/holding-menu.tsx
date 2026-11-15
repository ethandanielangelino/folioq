'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Menu } from '@base-ui/react/menu'
import { CalendarDays, Ellipsis, PencilLine, Trash2 } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import {
  dangerButton,
  dialogPanel,
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
} from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { classifyTicker, deleteHolding, updateHolding, type Classification } from '@/app/dashboard/actions'
import { CurrencySelect, moneyCurrencies } from '@/app/dashboard/[id]/amount-choice'
import { currencyName } from '@/app/dashboard/[id]/cash-choice'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LISTED_GROUPS, METALS, allowedGroups, assetLabel, kindOf, unitName, type AssetClass } from '@/lib/assets'

export interface MenuHolding {
  id: string
  ticker: string
  assetClass: AssetClass
  quantity: number
  costBasis: number | null
  openedAt: string
}

type Mode = 'details' | 'fix' | 'delete'

const itemBase = 'flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none'
const item = `${itemBase} text-zinc-800 data-highlighted:bg-black/[.05] dark:text-zinc-200 dark:data-highlighted:bg-white/[.08]`
const dangerItem = `${itemBase} text-red-600 data-highlighted:bg-red-50 data-highlighted:text-red-700 dark:text-red-400 dark:data-highlighted:bg-red-500/15`

const chip = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'bg-black text-white dark:bg-white dark:text-black'
      : 'border border-black/[.1] text-zinc-700 hover:border-black/30 dark:border-white/[.15] dark:text-zinc-300 dark:hover:border-white/40'
  }`

/** What a holding is called in the menu and dialogs. */
const nameOf = (h: MenuHolding) =>
  kindOf(h.assetClass) === 'metal'
    ? (METALS[h.ticker] ?? h.ticker)
    : kindOf(h.assetClass) === 'cash'
      ? `${currencyName(h.ticker)} cash`
      : h.ticker

/**
 * The quieter actions on a holding, behind "More": edit its details, fix a
 * mistake in its amount or cost, or delete it. Buy and Sell stay on the row.
 */
export default function HoldingMenu({
  portfolioId,
  holding,
  today,
}: {
  portfolioId: string
  holding: MenuHolding
  /** Today in New York, YYYY-MM-DD. */
  today: string
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const isCash = kindOf(holding.assetClass) === 'cash'
  const name = nameOf(holding)

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={`More for ${name}`}
          title="More"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/[.05] hover:text-black data-popup-open:bg-black/[.06] data-popup-open:text-black dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-50 dark:data-popup-open:bg-white/[.1] dark:data-popup-open:text-zinc-50"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
            <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-2xl border border-black/[.08] bg-white p-1.5 shadow-lg shadow-black/[.08] outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 dark:border-white/[.1] dark:bg-zinc-900">
              {!isCash && (
                <Menu.Item className={item} onClick={() => setMode('details')}>
                  <CalendarDays className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  Edit details
                </Menu.Item>
              )}
              <Menu.Item className={item} onClick={() => setMode('fix')}>
                <PencilLine className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                {isCash ? 'Fix the amount' : 'Fix a mistake'}
              </Menu.Item>
              <Menu.Separator className="mx-2 my-1.5 h-px bg-black/[.06] dark:bg-white/[.08]" />
              <Menu.Item
                className={dangerItem}
                onClick={() => setMode('delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {isCash ? 'Remove' : 'Delete'}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <HoldingEditDialog
        key={mode ?? 'closed'}
        mode={mode}
        onClose={() => setMode(null)}
        portfolioId={portfolioId}
        holding={holding}
        today={today}
      />
    </>
  )
}

function HoldingEditDialog({
  mode,
  onClose,
  portfolioId,
  holding,
  today,
}: {
  mode: Mode | null
  onClose: () => void
  portfolioId: string
  holding: MenuHolding
  today: string
}) {
  const toast = useToast()
  const money = useMoney()
  const display = money.wanted || money.code
  const uid = useId()
  const kind = kindOf(holding.assetClass)
  const isCash = kind === 'cash'
  const name = nameOf(holding)
  const [group, setGroup] = useState<AssetClass>(holding.assetClass)
  const [openedAt, setOpenedAt] = useState(holding.openedAt)
  const [quantity, setQuantity] = useState(String(holding.quantity))
  const shownCost = holding.costBasis !== null ? String(Math.round(holding.costBasis * 10000) / 10000) : ''
  const [cost, setCost] = useState(shownCost)
  const [costCurrency, setCostCurrency] = useState('USD')
  const [listing, setListing] = useState<Classification | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  // What a listed ticker is decides which groups it may go in. Asked when "Edit details" opens.
  useEffect(() => {
    if (mode !== 'details' || kind !== 'listed') return
    let current = true
    classifyTicker(holding.ticker).then((found) => {
      if (current) setListing(found)
    })
    return () => {
      current = false
    }
  }, [mode, kind, holding.ticker])
  const groups = listing ? allowedGroups(listing.type) : null

  function save(fix: boolean) {
    const form = new FormData()
    form.set('opened_at', openedAt)
    if (kind === 'listed') form.set('asset_class', group)
    if (fix) {
      form.set('fix', 'on')
      form.set('quantity', quantity)
      // The cost is only sent when it was changed: the field shows it rounded, and
      // sending that back would record a correction nobody made.
      if (!isCash && (cost !== shownCost || costCurrency !== 'USD')) {
        form.set('cost_basis', cost)
        form.set('cost_currency', costCurrency)
      }
    }
    setError('')
    startTransition(async () => {
      const result = await updateHolding(portfolioId, holding.id, form)
      if (!result.ok) return setError(result.error)
      startTransition(() => {
        onClose()
        toast(fix ? `${name} corrected` : `${name} updated`)
      })
    })
  }

  function remove() {
    setError('')
    startTransition(async () => {
      const result = await deleteHolding(portfolioId, holding.id)
      if (!result.ok) return setError(result.error)
      startTransition(() => {
        onClose()
        toast(`${name} ${isCash ? 'removed' : 'deleted'}`)
      })
    })
  }

  const title =
    mode === 'details' ? `Edit ${name}` : mode === 'fix' ? (isCash ? `Fix the ${name} amount` : `Fix a mistake in ${name}`) : `${isCash ? 'Remove' : 'Delete'} ${name}?`

  return (
    <Dialog open={mode !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto`}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {mode === 'details'
            ? 'Change how it is grouped and when it was opened. To record buying or selling, use Buy or Sell on its row.'
            : mode === 'fix'
              ? isCash
                ? 'Only for correcting an amount entered wrongly. To record money coming in or going out, use Add money or Take money out. The change is kept in the history as a correction.'
                : 'Only for correcting what was entered wrongly. To record buying or selling, use Buy or Sell, which price it from the date. The change is kept in the history as a correction.'
              : isCash
                ? 'Removes this cash line without recording where the money went. To record taking it out, use Take money out instead.'
                : 'Removes the holding without recording a sale. Its thesis and every earlier version go with it. This can’t be undone.'}
        </DialogDescription>

        {mode === 'delete' ? (
          <div className="rise-in mt-6">
            {!isCash && (
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Sold it? Use <span className="font-medium text-black dark:text-zinc-50">Sell</span> instead, so the
                money moves into your cash.
              </p>
            )}
            {error && (
              <p role="alert" className={`mt-4 ${errorText}`}>
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <DialogClose className={outlineButton}>{isCash ? 'Keep it' : 'Keep holding'}</DialogClose>
              <button type="button" onClick={remove} disabled={pending} className={dangerButton}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {pending ? (isCash ? 'Removing…' : 'Deleting…') : isCash ? 'Remove cash line' : 'Delete holding'}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="rise-in mt-6 flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              save(mode === 'fix')
            }}
          >
            {mode === 'details' && kind === 'listed' && (
              <fieldset>
                <legend className={fieldLabel}>Label</legend>
                {!listing ? (
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Checking what {holding.ticker} is…</p>
                ) : listing.type === 'company' || listing.type === 'reit' ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {listing.name ?? holding.ticker} is {listing.type === 'reit' ? 'a property company (a REIT)' : 'a company'}, so it is labelled{' '}
                    <span className="font-medium text-black dark:text-zinc-50">{assetLabel(groups![0], true)}</span>.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Label" className="mt-2 flex flex-wrap gap-2">
                      {LISTED_GROUPS.filter((g) => groups!.includes(g.value)).map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          role="radio"
                          aria-checked={group === g.value}
                          onClick={() => setGroup(g.value)}
                          className={chip(group === g.value)}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {listing.type === 'fund' ? `${listing.name ?? holding.ticker} is a fund. ` : ''}
                      {LISTED_GROUPS.find((g) => g.value === group)?.label} is for{' '}
                      {LISTED_GROUPS.find((g) => g.value === group)?.example}.
                    </p>
                  </>
                )}
              </fieldset>
            )}

            {mode === 'details' && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-opened`} className={fieldLabel}>
                  Date opened
                </label>
                <input
                  id={`${uid}-opened`}
                  type="date"
                  required
                  max={today}
                  value={openedAt}
                  onChange={(e) => setOpenedAt(e.target.value)}
                  className={field}
                />
              </div>
            )}

            {mode === 'fix' && (
              <>
                <div className="flex flex-col gap-2">
                  <label htmlFor={`${uid}-qty`} className={fieldLabel}>
                    {isCash ? `Amount in ${holding.ticker}` : `${unitName(holding.assetClass, 2).replace(/^./, (c) => c.toUpperCase())} held`}
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
                {!isCash && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`${uid}-cost`} className={fieldLabel}>
                      Average cost per {unitName(holding.assetClass, 1)}
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
                      <CurrencySelect
                        label="Currency of the average cost"
                        value={costCurrency}
                        onChange={setCostCurrency}
                        options={moneyCurrencies(display)}
                      />
                    </div>
                    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      Shown in US dollars. To enter it in another currency, choose it and type the cost in that
                      currency. Leave it blank if you don&apos;t know it; gain is then left out.
                      {costCurrency !== 'USD' && ' It is converted to US dollars at the rate on the date opened.'}
                    </p>
                  </div>
                )}
              </>
            )}

            {error && (
              <p role="alert" className={errorText}>
                {error}
              </p>
            )}

            <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <DialogClose className={outlineButton}>Cancel</DialogClose>
              <button type="submit" disabled={pending || (mode === 'details' && kind === 'listed' && !listing)} className={primaryButton}>
                {pending ? 'Saving…' : mode === 'fix' ? 'Save correction' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
