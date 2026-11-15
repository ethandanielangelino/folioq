import type { HistoryPoint } from '@/lib/portfolio'

const WIDTH = 132
const HEIGHT = 40
const PAD = 5

/**
 * A small, axis-free line of recent portfolio value. Purely a glance: the
 * exact figures are on the portfolio's own page.
 */
export default function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return null

  const values = points.map((p) => p.marketValue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (i: number) => PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2)
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lastX = x(points.length - 1)
  const lastY = y(values[values.length - 1])

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <path
        d={`${line} L${lastX.toFixed(1)},${HEIGHT} L${x(0).toFixed(1)},${HEIGHT} Z`}
        fill="var(--viz-series)"
        opacity={0.08}
        className="fade-late"
      />
      <path
        d={line}
        pathLength={1}
        className="line-draw"
        fill="none"
        stroke="var(--viz-series)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={3.5}
        fill="var(--viz-series)"
        className="fade-late stroke-white dark:stroke-zinc-900"
        strokeWidth={2}
      />
    </svg>
  )
}
