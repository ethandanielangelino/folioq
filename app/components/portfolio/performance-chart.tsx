'use client'

import { useMoney } from '@/app/components/money'
import { useEffect, useMemo, useRef, useState } from 'react'
import { card } from '@/app/components/styles'
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatShortDate,
  formatSignedMoney,
} from '@/lib/format'

export interface PerformancePoint {
  /** YYYY-MM-DD */
  date: string
  marketValue: number
  costBasis: number
}

const HEIGHT = 260
const MARGIN = { top: 12, right: 16, bottom: 28, left: 56 }

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Round tick values (1, 2, 2.5, 5 × 10ⁿ) covering [min, max]. */
function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const rawStep = (max - min) / target
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? rawStep
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v < max + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

function LineKey({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-0.5 w-4 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

const RANGES = [
  { id: '1M', label: '1M', days: 31 },
  { id: '3M', label: '3M', days: 92 },
  { id: '1Y', label: '1Y', days: 366 },
  { id: 'ALL', label: 'All', days: Infinity },
] as const
type RangeId = (typeof RANGES)[number]['id']

export default function PerformanceChart({ points: allPoints }: { points: PerformancePoint[] }) {
  const money = useMoney()
  const [range, setRange] = useState<RangeId>('ALL')

  // Days of history on record decide which ranges are worth offering.
  const span =
    allPoints.length > 1
      ? dayNumber(allPoints[allPoints.length - 1].date) - dayNumber(allPoints[0].date)
      : 0
  const ranges = RANGES.filter((r) => r.days === Infinity || span > r.days)

  const points = useMemo(() => {
    const chosen = RANGES.find((r) => r.id === range)
    if (!chosen || chosen.days === Infinity || allPoints.length === 0) return allPoints
    const cutoff = dayNumber(allPoints[allPoints.length - 1].date) - chosen.days
    return allPoints.filter((p) => dayNumber(p.date) >= cutoff)
  }, [allPoints, range])

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (points.length < 2) return null

    const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10)
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom

    const days = points.map((p) => dayNumber(p.date))
    const firstDay = days[0]
    const span = Math.max(days[days.length - 1] - firstDay, 1)

    const values = points.flatMap((p) => [p.marketValue, p.costBasis])
    const ticks = niceTicks(Math.min(...values), Math.max(...values))
    const yMin = ticks[0]
    const yMax = ticks[ticks.length - 1]

    const x = (i: number) => MARGIN.left + ((days[i] - firstDay) / span) * innerWidth
    const y = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * innerHeight

    const xs = points.map((_, i) => x(i))
    const path = (pick: (p: PerformancePoint) => number) =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${y(pick(p)).toFixed(1)}`)
        .join(' ')

    const valuePath = path((p) => p.marketValue)
    const baseline = MARGIN.top + innerHeight
    const areaPath = `${valuePath} L${xs[xs.length - 1].toFixed(1)},${baseline} L${xs[0].toFixed(1)},${baseline} Z`

    // A handful of evenly spread date labels, always including both ends.
    const labelCount = Math.min(points.length, innerWidth < 420 ? 3 : 5)
    const labelIndexes = [
      ...new Set(
        Array.from({ length: labelCount }, (_, k) =>
          Math.round((k * (points.length - 1)) / (labelCount - 1)),
        ),
      ),
    ]

    return {
      innerWidth,
      baseline,
      ticks,
      xs,
      y,
      valuePath,
      costPath: path((p) => p.costBasis),
      areaPath,
      labelIndexes,
    }
  }, [points, width])

  function nearestIndex(clientX: number, svg: SVGSVGElement): number {
    if (!geometry) return 0
    const px = clientX - svg.getBoundingClientRect().left
    let best = 0
    for (let i = 1; i < geometry.xs.length; i++) {
      if (Math.abs(geometry.xs[i] - px) < Math.abs(geometry.xs[best] - px)) best = i
    }
    return best
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!geometry) return
    const last = points.length - 1
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const current = active ?? last
      setActive(Math.min(last, Math.max(0, current + (event.key === 'ArrowLeft' ? -1 : 1))))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(last)
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  const latest = points[points.length - 1]
  const shown = active !== null && points[active] ? points[active] : null

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <h2 className="text-xl text-black dark:text-zinc-50">Value over time</h2>
        {geometry && ranges.length > 1 && (
          <div
            role="radiogroup"
            aria-label="Time range"
            className="order-last inline-flex rounded-full bg-black/[.05] p-0.5 dark:bg-white/[.08]"
          >
            {ranges.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={range === r.id}
                onClick={() => {
                  setRange(r.id)
                  setActive(null)
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  range === r.id
                    ? 'bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {geometry && (
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <li className="flex items-center gap-2">
              <LineKey color="var(--viz-series)" />
              Market value
            </li>
            <li className="flex items-center gap-2">
              <LineKey color="var(--viz-context)" />
              Cost basis
            </li>
          </ul>
        )}
      </div>

      <div ref={containerRef} className="relative mt-4">
        {!geometry ? (
          <div className="flex min-h-[180px] flex-col justify-center rounded-2xl bg-zinc-50 px-6 py-8 text-sm text-zinc-600 dark:bg-white/[.03] dark:text-zinc-400">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              {points.length === 0 ? 'No history yet' : 'One day recorded so far'}
            </p>
            <p className="mt-1 max-w-md leading-6">
              FolioQ saves each holding&apos;s closing price once per market day. The line appears
              after two days are on record
              {latest ? ` — the first was ${formatDate(latest.date)}.` : '.'}
            </p>
          </div>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              role="img"
              aria-label={`Market value and cost basis from ${formatDate(points[0].date)} to ${formatDate(latest.date)}. Latest value ${formatMoney(latest.marketValue, money)}, cost basis ${formatMoney(latest.costBasis, money)}. Use the arrow keys to read each day.`}
              tabIndex={0}
              className="block max-w-full touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/40"
              onPointerMove={(e) => setActive(nearestIndex(e.clientX, e.currentTarget))}
              onPointerDown={(e) => setActive(nearestIndex(e.clientX, e.currentTarget))}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              onKeyDown={onKeyDown}
            >
              {geometry.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={MARGIN.left + geometry.innerWidth}
                    y1={geometry.y(tick)}
                    y2={geometry.y(tick)}
                    stroke="var(--viz-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={MARGIN.left - 10}
                    y={geometry.y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="var(--viz-label)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatMoneyCompact(tick, money)}
                  </text>
                </g>
              ))}

              {geometry.labelIndexes.map((i, k) => (
                <text
                  key={points[i].date}
                  x={geometry.xs[i]}
                  y={HEIGHT - 8}
                  textAnchor={
                    k === 0 ? 'start' : k === geometry.labelIndexes.length - 1 ? 'end' : 'middle'
                  }
                  fontSize={11}
                  fill="var(--viz-label)"
                >
                  {formatShortDate(points[i].date)}
                </text>
              ))}

              <path d={geometry.areaPath} fill="var(--viz-series)" opacity={0.1} />
              <path
                d={geometry.costPath}
                fill="none"
                stroke="var(--viz-context)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={geometry.valuePath}
                fill="none"
                stroke="var(--viz-series)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* End marker on the series that matters. */}
              {active === null && (
                <circle
                  cx={geometry.xs[points.length - 1]}
                  cy={geometry.y(latest.marketValue)}
                  r={4}
                  fill="var(--viz-series)"
                  className="stroke-white dark:stroke-zinc-900"
                  strokeWidth={2}
                />
              )}

              {shown && active !== null && (
                <g pointerEvents="none">
                  <line
                    x1={geometry.xs[active]}
                    x2={geometry.xs[active]}
                    y1={MARGIN.top}
                    y2={geometry.baseline}
                    stroke="var(--viz-axis)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={geometry.xs[active]}
                    cy={geometry.y(shown.costBasis)}
                    r={4}
                    fill="var(--viz-context)"
                    className="stroke-white dark:stroke-zinc-900"
                    strokeWidth={2}
                  />
                  <circle
                    cx={geometry.xs[active]}
                    cy={geometry.y(shown.marketValue)}
                    r={4}
                    fill="var(--viz-series)"
                    className="stroke-white dark:stroke-zinc-900"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>

            {shown && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-black/[.08] bg-white p-3 text-xs shadow-sm dark:border-white/[.12] dark:bg-zinc-800"
                style={
                  geometry.xs[active] > width / 2
                    ? { right: width - geometry.xs[active] + 12 }
                    : { left: geometry.xs[active] + 12 }
                }
              >
                <p className="text-zinc-500 dark:text-zinc-400">{formatDate(shown.date)}</p>
                <dl className="mt-2 flex flex-col gap-1.5 tabular-nums">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      <LineKey color="var(--viz-series)" />
                      Value
                    </dt>
                    <dd className="font-semibold text-black dark:text-zinc-50">
                      {formatMoney(shown.marketValue, money)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      <LineKey color="var(--viz-context)" />
                      Cost
                    </dt>
                    <dd className="font-semibold text-black dark:text-zinc-50">
                      {formatMoney(shown.costBasis, money)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-black/[.06] pt-1.5 dark:border-white/[.1]">
                    <dt className="text-zinc-500 dark:text-zinc-400">Gain</dt>
                    <dd className="font-semibold text-black dark:text-zinc-50">
                      {formatSignedMoney(shown.marketValue - shown.costBasis, money)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </>
        )}
      </div>

      {geometry && (
        <p className="mt-3 max-w-xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Shows what the current holdings were worth on each day, counting each one from the day it
          was opened. Changes to share counts are not replayed.
        </p>
      )}
      {geometry && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400">
            View as table
          </summary>
          <div className="mt-3 max-h-64 overflow-auto rounded-2xl border border-black/[.06] dark:border-white/[.08]">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Market value
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Cost basis
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Gain
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                {[...points].reverse().map((p) => (
                  <tr key={p.date} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-4 py-2">{formatDate(p.date)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.marketValue, money)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.costBasis, money)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatSignedMoney(p.marketValue - p.costBasis, money)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
