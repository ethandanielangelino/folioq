'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import Delta from '@/app/components/portfolio/delta'
import { Flash } from '@/app/components/portfolio/live'
import { goToTab } from '@/app/components/portfolio/tabs'
import { card } from '@/app/components/styles'
import type { Holding } from '@/lib/data'
import { formatMoney, formatPercent, formatShares } from '@/lib/format'
import { assetLabel, kindOf, priceKey, unitName } from '@/lib/assets'
import { historyFor } from '@/lib/history'
import HoldingHistory, { Expand, HistoryToggle, type HistoryContext } from '@/app/components/portfolio/holding-history'

type SortKey = 'ticker' | 'quantity' | 'costBasis' | 'price' | 'marketValue' | 'dayChange' | 'gain'
type Sort = { key: SortKey; descending: boolean }

const columns: { key: SortKey; label: string }[] = [
  { key: 'ticker', label: 'Holding' },
  { key: 'quantity', label: 'Quantity' },
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
  history,
}: {
  holdings: Holding[]
  /** Each holding's history, opened from its row. Not shown on public share links. */
  history?: HistoryContext
  /** Where ticker links lead: the public research pages, or the ones inside the app. */
  researchBase?: string
  /** Per-holding controls for the owner, keyed by holding id. */
  actions?: Record<string, React.ReactNode>
  /** When set, each row links to its thesis in that tab. */
  thesisTab?: string
}) {
  const [sort, setSort] = useState<Sort>({ key: 'marketValue', descending: true })
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set())
  const showHistory = history !== undefined && (history.available || history.canEdit)

  function toggleHistory(id: string) {
    setOpenHistory((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
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
        <>
        {/* Wide screens: a sortable table. */}
        {/* `relative` keeps visually-hidden labels inside this scroller. */}
        <div className="relative hidden overflow-x-auto md:block">
          {/* Each holding is its own row group, so its history opens right under it. */}
          <table className="w-full min-w-[820px] text-sm tabular-nums [&>tbody+tbody]:border-t [&>tbody+tbody]:border-black/[.06] dark:[&>tbody+tbody]:border-white/[.08]">
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
            {rows.map((h) => {
              const entries = showHistory && history.available ? historyFor(history.entries, priceKey(h.ticker, h.assetClass)) : []
              const open = openHistory.has(h.id)
              return (
              <Fragment key={h.id}>
              <tbody>
                <tr className="transition-colors hover:bg-black/[.015] dark:hover:bg-white/[.02]">
                  <th scope="row" className={`${td} font-normal`}>
                    {/* Only listed tickers have a research page. */}
                    {kindOf(h.assetClass) === 'listed' ? (
                      <Link
                        href={`${researchBase}/${encodeURIComponent(h.ticker)}`}
                        className="font-semibold text-black underline-offset-4 hover:underline dark:text-zinc-50"
                      >
                        {h.ticker}
                      </Link>
                    ) : (
                      <span className="font-semibold text-black dark:text-zinc-50">{h.ticker}</span>
                    )}
                    {' '}
                    <AssetPill holding={h} />
                    {h.name && (
                      <span className="mt-0.5 block max-w-[13rem] truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {h.name}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      {formatPercent(h.weight)} of portfolio
                    </span>
                    {showHistory && (
                      <HistoryToggle
                        open={open}
                        count={history.available ? entries.length : null}
                        onClick={() => toggleHistory(h.id)}
                        controls={`history-${h.id}`}
                        label={h.ticker}
                      />
                    )}
                  </th>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {formatShares(h.quantity)}
                    {/* Say what the number counts when it isn't shares. */}
                    {kindOf(h.assetClass) === 'cash' ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{h.ticker}</span>
                    ) : kindOf(h.assetClass) !== 'listed' ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {kindOf(h.assetClass) === 'metal' ? 'oz' : unitName(h.assetClass, h.quantity)}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {h.costBasis === null ? dash : formatMoney(h.costBasis, money)}
                  </td>
                  <td className={`${td} text-zinc-700 dark:text-zinc-300`}>
                    {h.price === null || kindOf(h.assetClass) === 'cash' ? (
                      dash
                    ) : (
                      <Flash value={h.price}>{formatMoney(h.price, money)}</Flash>
                    )}
                    <PriceCredit holding={h} stacked className="mt-0.5 block text-xs" />
                  </td>
                  <td className={`${td} font-medium text-black dark:text-zinc-50`}>
                    <Flash value={h.marketValue}>{formatMoney(h.marketValue, money)}</Flash>
                  </td>
                  <td className={td}>
                    <Delta amount={h.dayChange} showIcon={false} />
                    {/* Crypto never closes, so its "today" is the last 24 hours. */}
                    {h.assetClass === 'crypto' && h.dayChange !== null && (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">24h</span>
                    )}
                  </td>
                  <td className={td}>
                    <Delta amount={h.gain} ratio={h.gainPct} showIcon={false} stacked />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {/* The thesis above the trade buttons, so the row fits without scrolling sideways. */}
                    <span className="inline-flex flex-col items-end gap-2">
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
                      {actions?.[h.id] && <span className="inline-flex items-center gap-2">{actions[h.id]}</span>}
                    </span>
                  </td>
                </tr>
                {showHistory && (
                  <tr>
                    <td colSpan={columns.length + 1} className="p-0">
                      <Expand open={open} id={`history-${h.id}`}>
                        <div className="mx-6 mb-5 rounded-2xl bg-zinc-50 px-5 py-4 dark:bg-white/[.03]">
                          <HoldingHistory entries={entries} context={history} asset={h} />
                        </div>
                      </Expand>
                    </td>
                  </tr>
                )}
              </tbody>
              </Fragment>
              )
            })}
          </table>
        </div>

        {/* Phones: one card per holding, with its actions in reach rather than off the edge of a table. */}
        <ul className="divide-y divide-black/[.06] border-t border-black/[.06] md:hidden dark:divide-white/[.08] dark:border-white/[.08]">
          {rows.map((h) => {
            const entries = showHistory && history.available ? historyFor(history.entries, priceKey(h.ticker, h.assetClass)) : []
            const open = openHistory.has(`card-${h.id}`)
            return (
              <li key={h.id} data-testid="holding-card">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {kindOf(h.assetClass) === 'listed' ? (
                          <Link
                            href={`${researchBase}/${encodeURIComponent(h.ticker)}`}
                            className="font-semibold text-black underline-offset-4 hover:underline dark:text-zinc-50"
                          >
                            {h.ticker}
                          </Link>
                        ) : (
                          <span className="font-semibold text-black dark:text-zinc-50">{h.ticker}</span>
                        )}
                        {' '}
                        <AssetPill holding={h} inline />
                      </p>
                      {h.name && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{h.name}</p>}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-semibold text-black dark:text-zinc-50">
                        <Flash value={h.marketValue}>{formatMoney(h.marketValue, money)}</Flash>
                      </p>
                      <p className="text-xs">
                        <Delta amount={h.gain} ratio={h.gainPct} showIcon={false} />
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    <span>
                      {formatShares(h.quantity)} {kindOf(h.assetClass) === 'metal' ? 'oz' : unitName(h.assetClass, h.quantity)}
                      {h.price !== null && ` at ${formatMoney(h.price, money)}`}
                      {h.costBasis !== null && `, cost ${formatMoney(h.costBasis, money)}`}
                    </span>
                    <span>
                      Today <Delta amount={h.dayChange} showIcon={false} />
                      {h.assetClass === 'crypto' && h.dayChange !== null && ' (24h)'}
                    </span>
                  </p>
                  {h.priceSource && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {kindOf(h.assetClass) === 'cash' ? '' : 'Price: '}
                      <PriceCredit holding={h} />
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {showHistory ? (
                      <HistoryToggle
                        open={open}
                        count={history.available ? entries.length : null}
                        onClick={() => toggleHistory(`card-${h.id}`)}
                        controls={`history-card-${h.id}`}
                        label={h.ticker}
                      />
                    ) : (
                      <span />
                    )}
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      {thesisTab && (
                        <button
                          type="button"
                          onClick={() => goToTab(thesisTab, `thesis-${h.id}`)}
                          className="rounded-full bg-black/[.05] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-200"
                        >
                          {h.thesis ? `Thesis v${h.thesis.version}` : 'No thesis'}
                        </button>
                      )}
                      {actions?.[h.id]}
                    </span>
                  </div>
                </div>
                {showHistory && (
                  <Expand open={open} id={`history-card-${h.id}`}>
                    <div className="mx-4 mb-4 rounded-2xl bg-zinc-50 px-4 py-4 dark:bg-white/[.03]">
                      <HoldingHistory entries={entries} context={history} asset={h} />
                    </div>
                  </Expand>
                )}
              </li>
            )
          })}
        </ul>
        </>
      )}
    </section>
  )
}

/**
 * Where a holding's price came from, linked to it: the exchange and pair when
 * it is quoted directly in the display currency, or the US-dollar source
 * (marked "in US$" when the figure shown is converted). For cash in another
 * currency, the site its exchange rate came from.
 */
function PriceCredit({
  holding,
  className = '',
  stacked = false,
}: {
  holding: Holding
  className?: string
  /** Name on one line, market or "in US$" on the next: for the table's narrow column. */
  stacked?: boolean
}) {
  const money = useMoney()
  const source = holding.priceSource
  if (!source) return null
  const cash = kindOf(holding.assetClass) === 'cash'
  const converted = money.code !== 'USD'
  const [first, second] = source.saved
    ? ['Last saved price', null]
    : cash
      ? [`Rate from ${source.name}`, null]
      : source.pair
        ? [source.name, source.pair]
        : source.currency
          ? [source.name, `in ${source.currency}`]
          : converted
            ? [source.name, 'in US$']
            : [source.name, null]
  const label = stacked ? (
    <>
      <span className="block whitespace-nowrap">{first}</span>
      {second && <span className="block whitespace-nowrap">{second}</span>}
    </>
  ) : second ? (
    `${first}, ${second}`
  ) : (
    first
  )
  const title = source.saved
    ? 'No source answered just now, so this is the last price FolioQ saved.'
    : cash
      ? `Valued at the exchange rate from ${source.name}.`
      : source.venue
        ? `Priced on ${source.name}'s ${source.pair} market, the exchange chosen for this holding${
            source.pair?.endsWith(`/${money.code}`) ? '' : `, converted to ${money.code}`
          }.`
        : source.pair
          ? `Quoted directly in ${money.code} on ${source.name}'s ${source.pair} market.`
          : source.currency
            ? `${source.name}'s price in ${source.currency}, as the market quotes it${source.currency === money.code ? '' : `, converted to ${money.code}`}.`
            : converted
          ? `${source.name}'s US-dollar price, converted to ${money.code}.`
          : `Price from ${source.name}.`
  const style = `text-zinc-500 dark:text-zinc-400 ${className}`
  if (!source.url) {
    return (
      <span className={style} title={title}>
        {label}
      </span>
    )
  }
  const external = source.url.startsWith('http')
  return (
    <a
      href={source.url}
      title={title}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`${style} underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-200`}
    >
      {label}
    </a>
  )
}

/** The label every holding carries, so each one says what it is: Stock, Bond fund, Crypto, Precious metal... */
function AssetPill({ holding, inline = false }: { holding: Holding; inline?: boolean }) {
  return (
    <span
      className={`${inline ? '' : 'ml-2 '}inline-block rounded-full bg-black/[.05] px-2 py-0.5 whitespace-nowrap text-[0.7rem] font-medium text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300`}
    >
      {assetLabel(holding.assetClass, holding.industry !== null)}
    </span>
  )
}
