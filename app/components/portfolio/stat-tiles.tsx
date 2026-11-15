import { Amount, RateNote } from '@/app/components/money'
import Delta from '@/app/components/portfolio/delta'
import { Flash } from '@/app/components/portfolio/live'
import { card } from '@/app/components/styles'
import type { PortfolioTotals } from '@/lib/portfolio'

function Tile({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  )
}

function list(tickers: string[]): string {
  return tickers.join(', ')
}

export default function StatTiles({
  totals,
  footer,
  todayHint = 'Since the previous close',
  cash = null,
}: {
  totals: PortfolioTotals
  /** Value held as cash, when there is any; the total is then split into invested and cash. */
  cash?: number | null
  /** What "Today" is measured from; it differs when crypto is held. */
  todayHint?: string
  /** Optional line under the tiles, such as the live-refresh status. */
  footer?: React.ReactNode
}) {
  const notes: string[] = []
  if (totals.unpriced.length > 0) {
    notes.push(
      `No live price for ${list(totals.unpriced)} right now, so ${
        totals.unpriced.length === 1 ? 'it is' : 'they are'
      } counted at cost.`
    )
  }
  if (totals.uncosted.length > 0) {
    notes.push(
      `No cost on record for ${list(totals.uncosted)}, so ${
        totals.uncosted.length === 1 ? 'it is' : 'they are'
      } left out of the gain.`
    )
  }

  return (
    <section aria-label="Portfolio totals" className={`${card} min-w-0 overflow-hidden`}>
      <div className="grid sm:grid-cols-[1.4fr_1fr_1fr] sm:divide-x sm:divide-black/[.06] dark:sm:divide-white/[.08]">
        <div className="border-b border-black/[.06] px-6 py-5 sm:border-b-0 dark:border-white/[.08]">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {cash !== null ? 'Total value' : 'Market value'}
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
            <Flash value={totals.marketValue}>
              <Amount value={totals.marketValue} />
            </Flash>
          </p>
          {cash !== null && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-medium text-black tabular-nums dark:text-zinc-50">
                <Amount value={totals.marketValue - cash} />
              </span>{' '}
              invested and{' '}
              <span className="font-medium text-black tabular-nums dark:text-zinc-50">
                <Amount value={cash} />
              </span>{' '}
              in cash
            </p>
          )}
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Cost of what is invested <Amount value={totals.costBasis} />
          </p>
        </div>
        <Tile label="Gain" hint="Current value against what the holdings cost">
          <Delta amount={totals.gain} ratio={totals.gainPct} />
        </Tile>
        <Tile label="Today" hint={todayHint}>
          <Delta amount={totals.dayChange} ratio={totals.dayChangePct} />
        </Tile>
      </div>
      <RateNote className="border-t border-black/[.06] px-6 py-2.5 text-xs leading-5 text-zinc-600 dark:border-white/[.08] dark:text-zinc-400" />
      {(notes.length > 0 || footer) && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-black/[.06] px-6 py-2.5 dark:border-white/[.08]">
          <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{notes.join(' ')}</p>
          {footer}
        </div>
      )}
    </section>
  )
}
