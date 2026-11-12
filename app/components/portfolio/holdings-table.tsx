'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import Delta from '@/app/components/portfolio/delta'
import { Flash } from '@/app/components/portfolio/live'
import { goToTab } from '@/app/components/portfolio/tabs'
import { card } from '@/app/components/styles'
import type { Holding } from '@/lib/data'
import { formatMoney, formatPercent, formatShares } from '@/lib/format'

type SortKey = 'ticker' | 'quantity' | 'costBasis' | 'price' | 'marketValue' | 'dayChange' | 'gain'
type Sort = { key: SortKey; descending: boolean }

const columns: { key: SortKey; label: string }[] = [
  { key: 'ticker', label: 'Holding' },
  { key: 'quantity', label: 'Shares' },
  { key: 'costBasis', label: 'Avg cost' },
  { key: 'price', label: 'Price' },
  { key: 'marketValue', label: 'Value' },
  { key: 'dayChange', label: 'Today' },
  { key: 'gain', label: 'Gain' },
]

// Tight side padding: amounts in other currencies carry a code and need the room.
const td = 'px-2.5 py-4 text-right align-top first:pl-6 first:text-left last:pr-6'
const dash = <span className="text-zinc-400 dark:text-zinc-500">—</span>

function sortHoldings(holdings: Holding[], sort: Sort): Holding[] {
  const direction = sort.descending ? -1 : 1
  return [...holdings].sort((a, b) => {
    if (sort.key === 'ticker') return direction * a.ticker.localeCompare(b.ticker)
    const x = a[sort.key]
    const y = b[sort.key]
    // Holdings with no figure for this column always sink to the bottom.
    if (x === null && y === null) return a.ticker.localeCompare(b.ticker)
    if (x === null) return 1
    if (y === null) return -1
    return direction * (x - y) || a.ticker.localeCompare(b.ticker)
  })
}

export default function HoldingsTable({
  holdings,
  actions,
  thesisTab,
  researchBase = '/research',
}: {
  holdings: Holding[]
  /** Where ticker links lead: the public research pages, or the ones inside the app. */
  researchBase?: string
  /** Per-holding controls for the owner, keyed by holding id. */
  actions?: Record<string, React.ReactNode>
  /** When set, each row links to its thesis in that tab. */
  thesisTab?: string
}) {
  const [sort, setSort] = useState<Sort>({ key: 'marketValue', descending: true })
  const money = useMoney()
  const rows = sortHoldings(holdings, sort)

  function toggle(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : // Text sorts A to Z first; numbers sort largest first.
          { key, descending: key !== 'ticker' }
    )
  }

  return (
    <section className={`${card} min-w-0 overflow-hidden`}>
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-xl text-black dark:text-zinc-50">Holdings</h2>
      </div>

      {holdings.length === 0 ? (
        <p className="px-6 pt-2 pb-8 text-sm text-zinc-500 dark:text-zinc-400">
          Nothing held right now.
        </p>
      ) : (
        // `relative` keeps visually-hidden labels inside this scroller.
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-black/[.06] dark:border-white/[.08]">
                {columns.map((column) => {
                  const active = sort.key === column.key
                  const Icon = sort.descending ? ArrowDown : ArrowUp
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                      className="px-2.5 py-2 text-right first:pl-6 first:text-left"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(column.key)}
                        className={`group -mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                          active
                            ? 'text-black dark:text-zinc-50'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {column.label}
                        <Icon
                          aria-hidden="true"
                          className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}
                        />
                      </button>
                    </th>
                  )
                })}
                <th scope="col" className="px-2.5 py-2 pr-6">
                  <span className="sr-only">Thesis and actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {rows.map((h) => (
                <tr
                  key={h.id}
                  className="transition-colors hover:bg-black/[.015] dark:hover:bg-white/[.02]"
                >
                  <th scope="row" className={`${td} font-normal`}>
                    <Link
                      href={`${researchBase}/${encodeURIComponent(h.ticker)}`}
                      className="font-semibold text-black underline-offset-4 hover:underline dark:text-zinc-50"
                    >
                      {h.ticker}
                    </Link>
                    {h.name && (
                      <span className="mt-0.5 block max-w-[13rem] truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {h.name}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      {formatPercent(h.weight)} of portfolio
                    </span>
                  </th>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {formatShares(h.quantity)}
                  </td>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {h.costBasis === null ? dash : formatMoney(h.costBasis, money)}
                  </td>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {h.price === null ? (
                      dash
                    ) : (
                      <Flash value={h.price}>{formatMoney(h.price, money)}</Flash>
                    )}
                  </td>
                  <td className={`${td} font-medium text-black dark:text-zinc-50`}>
                    <Flash value={h.marketValue}>{formatMoney(h.marketValue, money)}</Flash>
                  </td>
                  <td className={td}>
                    <Delta amount={h.dayChange} showIcon={false} />
                  </td>
                  <td className={td}>
                    <Delta amount={h.gain} ratio={h.gainPct} showIcon={false} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="inline-flex items-center justify-end gap-3">
                      {thesisTab && (
                        <button
                          type="button"
                          onClick={() => goToTab(thesisTab, `thesis-${h.id}`)}
                          aria-label={
                            h.thesis
                              ? `Show the thesis for ${h.ticker}`
                              : `${h.ticker} has no thesis. Open the theses tab`
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            h.thesis
                              ? 'bg-black/[.05] text-zinc-700 hover:bg-black/[.09] dark:bg-white/[.08] dark:text-zinc-200 dark:hover:bg-white/[.14]'
                              : 'border border-dashed border-black/25 text-zinc-600 hover:border-black/50 dark:border-white/30 dark:text-zinc-400 dark:hover:border-white/60'
                          }`}
                        >
                          {h.thesis ? `Thesis v${h.thesis.version}` : 'No thesis'}
                        </button>
                      )}
                      {actions?.[h.id]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
