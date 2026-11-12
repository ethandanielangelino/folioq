import { card } from '@/app/components/styles'
import { formatMoney, formatPercent } from '@/lib/format'

export interface AllocationRow {
  label: string
  marketValue: number
  /** 0..1 */
  weight: number
}

const MAX_ROWS = 8

/** Folds a long tail into "Other" so the list stays readable. */
function foldTail(rows: AllocationRow[]): AllocationRow[] {
  if (rows.length <= MAX_ROWS) return rows
  const head = rows.slice(0, MAX_ROWS - 1)
  const tail = rows.slice(MAX_ROWS - 1)
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      marketValue: tail.reduce((sum, r) => sum + r.marketValue, 0),
      weight: tail.reduce((sum, r) => sum + r.weight, 0),
    },
  ]
}

/**
 * Ranked horizontal bars: one hue, largest first, every value printed beside
 * its bar so nothing depends on hovering.
 */
export default function AllocationBars({
  title,
  rows,
  emptyText,
}: {
  title: string
  rows: AllocationRow[]
  emptyText: string
}) {
  const shown = foldTail(rows)
  const largest = shown.reduce((max, r) => Math.max(max, r.weight), 0)

  return (
    <section className={`${card} p-6`}>
      <h2 className="text-xl text-black dark:text-zinc-50">{title}</h2>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {shown.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatMoney(row.marketValue)}
                  <span className="ml-2 font-medium text-black dark:text-zinc-50">
                    {formatPercent(row.weight)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-2" aria-hidden="true">
                <div
                  className="h-2 rounded-r-[4px] bg-[var(--viz-series)]"
                  style={{
                    width: `${largest > 0 ? Math.max((row.weight / largest) * 100, 0.75) : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
