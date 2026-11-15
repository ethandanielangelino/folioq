'use client'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { direction, formatSignedMoney, formatSignedPercent } from '@/lib/format'

const tone = {
  up: 'text-emerald-700 dark:text-emerald-400',
  down: 'text-red-700 dark:text-red-400',
  flat: 'text-zinc-500 dark:text-zinc-400',
} as const

const label = { up: 'Up', down: 'Down', flat: 'Unchanged' } as const

/**
 * A gain or loss: signed amount, optional percentage, and an arrow so the
 * direction never depends on color alone.
 */
export default function Delta({
  amount,
  ratio,
  className = '',
  showIcon = true,
  stacked = false,
}: {
  amount: number | null
  ratio?: number | null
  className?: string
  showIcon?: boolean
  /** The percentage under the amount rather than beside it, for narrow table columns. */
  stacked?: boolean
}) {
  const money = useMoney()
  if (amount === null) {
    return <span className={`text-zinc-400 dark:text-zinc-500 ${className}`}>—</span>
  }

  const dir = direction(amount)
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus

  return (
    <span
      className={`inline-flex whitespace-nowrap ${stacked ? 'flex-col items-end' : 'items-center gap-1'} ${tone[dir]} ${className}`}
    >
      {showIcon && (
        <>
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">{label[dir]}</span>
        </>
      )}
      <span>{formatSignedMoney(amount, money)}</span>
      {ratio !== null && ratio !== undefined && (
        <span className={stacked ? 'text-xs' : ''}>({formatSignedPercent(ratio)})</span>
      )}
    </span>
  )
}
