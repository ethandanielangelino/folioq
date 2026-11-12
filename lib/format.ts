const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const sharesFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })

/** Typographic minus so negative numbers align and read cleanly. */
const MINUS = '−'

export function formatMoney(value: number): string {
  // Avoid "-$0.00" for tiny negative rounding leftovers.
  const rounded = Math.round(value * 100) / 100
  return usd.format(rounded === 0 ? 0 : rounded).replace('-', MINUS)
}

export function formatMoneyCompact(value: number): string {
  return usdCompact.format(value).replace('-', MINUS)
}

/** "+$1,204.10" / "−$88.00" / "$0.00" */
export function formatSignedMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (rounded === 0) return usd.format(0)
  return (rounded > 0 ? '+' : MINUS) + usd.format(Math.abs(rounded))
}

/** Takes a ratio: 0.1234 -> "12.34%" */
export function formatPercent(ratio: number): string {
  return percent.format(ratio).replace('-', MINUS)
}

export function formatSignedPercent(ratio: number): string {
  const rounded = Math.round(ratio * 10000) / 10000
  if (rounded === 0) return percent.format(0)
  return (rounded > 0 ? '+' : MINUS) + percent.format(Math.abs(rounded))
}

export function formatShares(value: number): string {
  return sharesFormat.format(value)
}

/** "2026-01-05" -> "Jan 5, 2026". Parsed as a calendar date, never shifted by time zone. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "2026-01-05" -> "Jan 5" */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Today's calendar date in New York, where US markets trade. YYYY-MM-DD. */
export function marketDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type Direction = 'up' | 'down' | 'flat'

export function direction(value: number | null | undefined): Direction {
  if (value === null || value === undefined) return 'flat'
  const rounded = Math.round(value * 100) / 100
  if (rounded > 0) return 'up'
  if (rounded < 0) return 'down'
  return 'flat'
}
