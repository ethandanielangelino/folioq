'use client'

import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Flag, HandCoins, PencilLine, ShoppingCart, Trash2 } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import Delta from '@/app/components/portfolio/delta'
import { METALS, kindOf, unitName, type AssetClass } from '@/lib/assets'
import { CURRENCIES, money as inCurrency } from '@/lib/currency'
import { formatDate, formatDayDate, formatMoney, formatShares } from '@/lib/format'
import { ENTERED, saleGain, type HistoryEntry } from '@/lib/history'

/** What the history panel needs to know about the page. */
export interface HistoryContext {
  /** False until supabase/history.sql has been run. */
  available: boolean
  entries: HistoryEntry[]
  /** The signed-in person, so their own entries read "by you". */
  me: string | null
  /** Owners and editors are told how to turn history on. */
  canEdit: boolean
}

const ICONS = {
  opened: Flag,
  bought: ShoppingCart,
  sold: HandCoins,
  corrected: PencilLine,
  removed: Trash2,
  deposited: ArrowDownToLine,
  withdrawn: ArrowUpFromLine,
}

const TONE = {
  opened: 'bg-mint-600/10 text-mint-700 dark:bg-mint-400/15 dark:text-mint-300',
  bought: 'bg-mint-600/10 text-mint-700 dark:bg-mint-400/15 dark:text-mint-300',
  sold: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  corrected: 'bg-black/[.05] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300',
  removed: 'bg-black/[.05] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300',
  deposited: 'bg-mint-600/10 text-mint-700 dark:bg-mint-400/15 dark:text-mint-300',
  withdrawn: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
}

const nameOf = (e: HistoryEntry) => (kindOf(e.assetClass) === 'metal' ? (METALS[e.ticker] ?? e.ticker) : e.ticker)

/** "US dollar", "Singapore dollar": the cash line a trade's money went through. */
const currencyWord = (e: HistoryEntry) => CURRENCIES.find((c) => c.code === e.cashCurrency)?.name ?? e.cashCurrency

const amountOf = (e: HistoryEntry, quantity: number) =>
  kindOf(e.assetClass) === 'cash'
    ? inCurrency(quantity, { code: e.ticker, rate: 1 })
    : `${formatShares(quantity)} ${unitName(e.assetClass, quantity)}`

/**
 * The button that opens a holding's history. It says how many entries there
 * are, and turns to show whether the history is open.
 */
export function HistoryToggle({
  open,
  count,
  onClick,
  controls,
  label,
}: {
  open: boolean
  count: number | null
  onClick: () => void
  controls: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'Hide' : 'Show'} the history of ${label}`}
      className="group/history -ml-1 mt-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
    >
      <ChevronRight
        aria-hidden="true"
        className={`h-3.5 w-3.5 transition-transform duration-250 ease-[cubic-bezier(0.22,0.8,0.24,1)] ${open ? 'rotate-90' : ''}`}
      />
      History{count !== null && count > 0 ? ` (${count})` : ''}
    </button>
  )
}

/**
 * Opens from nothing to the content's own height, so there is no guessed
 * size and no jump. Closed content is inert: not focusable, not read out.
 */
export function Expand({ open, id, children }: { open: boolean; id: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,0.8,0.24,1)] ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** The list of entries for one holding (or one cash line), newest first. */
export default function HoldingHistory({
  entries,
  context,
  asset,
}: {
  entries: HistoryEntry[]
  context: HistoryContext
  /** The holding or cash line this history belongs to. */
  asset: { ticker: string; assetClass: AssetClass }
}) {
  const money = useMoney()
  const isCash = kindOf(asset.assetClass) === 'cash'

  if (!context.available) {
    return (
      <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        History starts once <code className="font-mono text-xs">supabase/history.sql</code> has been
        run in the Supabase SQL editor.
      </p>
    )
  }
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing recorded yet.</p>
  }

  /** "the close on Fri, Nov 13, 2026, from Yahoo Finance", "the live price, from Finnhub", or a typed price. */
  const pricedFrom = (e: HistoryEntry) =>
    e.priceSource === ENTERED
      ? 'a price entered by hand, as no market price was found'
      : e.priceSource
        ? `${e.priceDate ? `the close on ${formatDayDate(e.priceDate)}` : 'the live price'}, from ${e.priceSource}`
        : null
  /** Money moved, in the currency of the cash line it went through. */
  const cashAmount = (e: HistoryEntry, value: number) => inCurrency(value, { code: e.cashCurrency, rate: 1 })

  function describe(e: HistoryEntry): { title: string; detail: string | null } {
    const each = e.price !== null ? formatMoney(e.price, money) : null
    const source = pricedFrom(e)

    // Money a trade moved through this cash line.
    if (isCash && e.assetKey !== `CASH:${asset.ticker}`) {
      return e.cashChange > 0
        ? { title: `From selling ${amountOf(e, e.quantity)} of ${nameOf(e)}`, detail: each ? `At ${each} each.` : null }
        : { title: `Paid for ${amountOf(e, e.quantity)} of ${nameOf(e)}`, detail: each ? `At ${each} each.` : null }
    }

    switch (e.kind) {
      case 'opened':
        if (e.beforeHistory) {
          return {
            title: isCash ? `Held ${amountOf(e, e.quantity)} when history began` : `Held ${amountOf(e, e.quantity)} when history began`,
            detail: isCash ? null : each ? `Average cost ${each}, as entered.` : 'Average cost not recorded.',
          }
        }
        if (isCash) return { title: `Added ${amountOf(e, e.quantity)}`, detail: null }
        if (source) {
          return {
            title: `Bought ${amountOf(e, e.quantity)}, a new holding`,
            detail: `At ${each} each, ${source}.${e.cashChange < 0 ? ` Paid from ${currencyWord(e)} cash.` : ''}`,
          }
        }
        return {
          title: `Added ${amountOf(e, e.quantity)} already owned`,
          detail: each ? `Average cost ${each}, as entered.` : 'Average cost not entered.',
        }
      case 'bought':
        return {
          title: `Bought ${formatShares(e.quantity)} more ${unitName(e.assetClass, e.quantity)}`,
          detail: `At ${each} each, ${source ?? 'as entered'}.${e.cashChange < 0 ? ` Paid from ${currencyWord(e)} cash.` : ' Paid with money from outside FolioQ.'}`,
        }
      case 'sold': {
        const all = e.quantityBefore !== null && e.quantity >= e.quantityBefore * (1 - 1e-9)
        return {
          title: `Sold ${amountOf(e, e.quantity)}${all ? ', all of it' : ''}`,
          detail: `At ${each} each, ${source ?? 'as entered'}. The money went to ${currencyWord(e)} cash.`,
        }
      }
      case 'corrected': {
        const parts: string[] = []
        if (e.quantityBefore !== null && e.quantityBefore !== e.quantity) {
          parts.push(`amount from ${amountOf(e, e.quantityBefore)} to ${amountOf(e, e.quantity)}`)
        }
        if (!isCash && e.costBasis !== e.price) {
          const from = e.costBasis !== null ? formatMoney(e.costBasis, money) : 'none'
          const to = e.price !== null ? formatMoney(e.price, money) : 'none'
          parts.push(`average cost from ${from} to ${to}`)
        }
        const text = parts.join(', and ')
        return { title: 'Corrected by hand', detail: text ? `Changed the ${text}.` : null }
      }
      case 'deposited':
        return { title: `Added ${amountOf(e, e.quantity)}`, detail: null }
      case 'withdrawn':
        return { title: `Took out ${amountOf(e, e.quantity)}`, detail: null }
      case 'removed':
        return {
          title: 'Removed from the portfolio',
          detail:
            e.quantityBefore !== null
              ? `${amountOf(e, e.quantityBefore)} deleted${isCash ? '' : ' without recording a sale'}.`
              : null,
        }
    }
  }

  /** The figure on the right: money moved, or what it cost. */
  function figure(e: HistoryEntry): React.ReactNode {
    if (e.cashChange !== 0) {
      return (
        <>
          <span className={`font-medium ${e.cashChange > 0 ? 'text-mint-700 dark:text-mint-300' : 'text-black dark:text-zinc-50'}`}>
            {e.cashChange > 0 ? '+' : '−'}
            {cashAmount(e, Math.abs(e.cashChange))}
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {e.cashChange > 0 ? 'into cash' : 'out of cash'}
          </span>
        </>
      )
    }
    if (e.kind === 'deposited' || e.kind === 'withdrawn') {
      return (
        <span className={`font-medium ${e.kind === 'deposited' ? 'text-mint-700 dark:text-mint-300' : 'text-black dark:text-zinc-50'}`}>
          {e.kind === 'deposited' ? '+' : '−'}
          {amountOf(e, e.quantity)}
        </span>
      )
    }
    if ((e.kind === 'bought' || e.kind === 'opened') && e.price !== null && !isCash) {
      return (
        <>
          <span className="font-medium text-black dark:text-zinc-50">{formatMoney(e.quantity * e.price, money)}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">at cost</span>
        </>
      )
    }
    return null
  }

  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => {
        const Icon = ICONS[e.kind]
        const { title, detail } = describe(e)
        const gain = !isCash ? saleGain(e) : null
        const by = e.beforeHistory ? null : e.createdBy && e.createdBy === context.me ? 'you' : e.actorName
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* The line joining one entry to the next. */}
            {i < entries.length - 1 && (
              <span aria-hidden="true" className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-black/[.08] dark:bg-white/[.1]" />
            )}
            <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE[e.kind]}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-1 pt-1">
              <div className="min-w-0 basis-72 flex-1">
                <p className="text-sm font-medium text-black dark:text-zinc-50">{title}</p>
                {detail && <p className="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{detail}</p>}
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(e.tradeDate)}
                  {by ? `, by ${by}` : ''}
                </p>
              </div>
              <div className="text-right text-sm tabular-nums">
                {figure(e)}
                {gain !== null && (
                  <span className="block text-xs">
                    <Delta amount={gain} showIcon={false} /> gain
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
