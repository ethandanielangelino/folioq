'use client'

import { useState } from 'react'
import { Banknote } from 'lucide-react'
import { Amount } from '@/app/components/money'
import { card } from '@/app/components/styles'
import { CURRENCIES, money } from '@/lib/currency'
import type { Holding } from '@/lib/data'
import { formatPercent } from '@/lib/format'
import { cashHistoryFor } from '@/lib/history'
import HoldingHistory, { Expand, HistoryToggle, type HistoryContext } from '@/app/components/portfolio/holding-history'

/**
 * Money that isn't invested: each currency held, what it is worth, and the
 * total. Selling a holding adds to the US dollar line.
 */
export default function CashCard({
  cash,
  actions,
  canAdd,
  history,
  controls,
}: {
  /** The portfolio's cash holdings. */
  cash: Holding[]
  /** Per-holding controls for the owner, keyed by holding id. */
  actions?: Record<string, React.ReactNode>
  /** Whether to say how cash gets here (owners and editors, not public visitors). */
  canAdd: boolean
  /** Each line's history: what was added, and for US dollars, what trades moved in and out. */
  history?: HistoryContext
  /** Add money and Take money out. */
  controls?: React.ReactNode
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const showHistory = history !== undefined && (history.available || history.canEdit)
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const total = cash.reduce((sum, h) => sum + h.marketValue, 0)
  const weight = cash.reduce((sum, h) => sum + h.weight, 0)

  return (
    <section aria-label="Cash" className={`${card} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-6 pt-6 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl text-black dark:text-zinc-50">
            <Banknote className="h-5 w-5 text-mint-700 dark:text-mint-300" aria-hidden="true" />
            Cash
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Money held, not invested.</p>
        </div>
        {controls && <div className="flex flex-wrap items-center gap-2 sm:order-last sm:basis-full">{controls}</div>}
        {cash.length > 0 && (
          <p className="text-right">
            <span className="block text-2xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
              <Amount value={total} />
            </span>
            <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              {formatPercent(weight)} of the portfolio
            </span>
          </p>
        )}
      </div>

      {cash.length === 0 ? (
        <p className="border-t border-black/[.06] px-6 py-5 text-sm leading-6 text-zinc-500 dark:border-white/[.08] dark:text-zinc-400">
          {canAdd
            ? 'No cash on record. Use Add money to record savings or a top-up in any currency. Selling a holding also puts its money here.'
            : 'No cash on record.'}
        </p>
      ) : (
        <ul className="divide-y divide-black/[.06] border-t border-black/[.06] dark:divide-white/[.08] dark:border-white/[.08]">
          {cash.map((h) => {
            const currency = CURRENCIES.find((c) => c.code === h.ticker)
            const entries = showHistory && history.available ? cashHistoryFor(history.entries, h.ticker) : []
            const isOpen = open.has(h.id)
            return (
              <li key={h.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-semibold text-black tabular-nums dark:text-zinc-50">
                    {/* The amount in its own currency, exactly as entered. */}
                    {money(h.quantity, { code: h.ticker, rate: 1 })}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {currency?.name ?? h.ticker}
                    {h.ticker !== 'USD' && h.price !== null && (
                      <>
                        , worth <Amount value={h.marketValue} />
                        {h.priceSource && !h.priceSource.saved && h.priceSource.url && (
                          <>
                            {' '}
                            at the rate from{' '}
                            <a
                              href={h.priceSource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline-offset-2 hover:underline"
                            >
                              {h.priceSource.name}
                            </a>
                          </>
                        )}
                        {h.priceSource?.saved && ' at the last rate FolioQ saved'}
                      </>
                    )}
                  </span>
                  {showHistory && (
                    <HistoryToggle
                      open={isOpen}
                      count={history.available ? entries.length : null}
                      onClick={() => toggle(h.id)}
                      controls={`history-${h.id}`}
                      label={`${h.ticker} cash`}
                    />
                  )}
                </span>
                <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                  {formatPercent(h.weight)}
                </span>
                {actions?.[h.id] && <span className="flex items-center gap-2">{actions[h.id]}</span>}
              </div>
              {showHistory && (
                <Expand open={isOpen} id={`history-${h.id}`}>
                  <div className="mx-6 mb-5 rounded-2xl bg-zinc-50 px-5 py-4 dark:bg-white/[.03]">
                    <HoldingHistory entries={entries} context={history} asset={h} />
                  </div>
                </Expand>
              )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
