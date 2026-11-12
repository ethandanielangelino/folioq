'use client'

import { createContext, useContext, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { setCurrency } from '@/app/actions/currency'
import {
  CURRENCIES,
  USD,
  describeRate,
  money,
  moneyCompact,
  moneySigned,
  type Money,
} from '@/lib/currency'
import type { MoneyState } from '@/lib/money'

const DEFAULT: MoneyState = { ...USD, source: 'usd', asOf: '', wanted: 'USD' }
const MoneyContext = createContext<MoneyState>(DEFAULT)

/**
 * Tells everything inside which currency to show amounts in. Pages that
 * don't provide one (the public marketing pages, with their sample fund)
 * show US dollars.
 */
export function MoneyProvider({
  value,
  children,
}: {
  value: MoneyState
  children: React.ReactNode
}) {
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

/** The display currency and its rate, for components that format amounts themselves. */
export function useMoney(): MoneyState {
  return useContext(MoneyContext)
}

/**
 * A US-dollar amount, shown in the display currency. Usable from server
 * components, which can't read the currency themselves.
 */
export function Amount({
  value,
  compact = false,
  signed = false,
  in: fixed,
}: {
  value: number
  compact?: boolean
  signed?: boolean
  /** Show in this exact currency with no conversion (a figure that is already in it). */
  in?: Money
}) {
  const current = useMoney()
  const m = fixed ?? current
  return <>{compact ? moneyCompact(value, m) : signed ? moneySigned(value, m) : money(value, m)}</>
}

function when(state: MoneyState): string {
  if (!state.asOf) return ''
  const date = new Date(state.asOf)
  if (Number.isNaN(date.getTime())) return ''
  return state.source === 'live'
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** One line saying what amounts are converted at, or nothing when they are in US dollars. */
export function RateNote({ className = '' }: { className?: string }) {
  const state = useMoney()
  if (state.source === 'usd') return null

  if (state.source === 'unavailable') {
    return (
      <p className={className}>
        Exchange rates for {state.wanted} can&apos;t be reached right now, so amounts are in US
        dollars.
      </p>
    )
  }

  const stamp = when(state)
  return (
    <p className={className}>
      Amounts are in {state.code}, converted at today&apos;s rate: {describeRate(state)}
      {state.source === 'live'
        ? ` (live${stamp ? `, ${stamp}` : ''})`
        : ` (European Central Bank rate${stamp ? ` for ${stamp}` : ''})`}
      . Holdings are priced and recorded in US dollars.
    </p>
  )
}

/** Chooses the display currency. The choice is saved, then the page reloads its figures. */
export function CurrencyPicker({ className = '', id = 'currency' }: { className?: string; id?: string }) {
  const router = useRouter()
  const state = useMoney()
  const [saving, startTransition] = useTransition()

  return (
    // The pill shows only the code; the real <select> lies invisibly over it,
    // so the menu that opens is the device's own, with every currency's name.
    <span
      className={`relative inline-flex h-9 shrink-0 items-center rounded-full border border-black/[.08] bg-white/70 text-sm font-medium text-zinc-800 transition-colors focus-within:border-mint-600 hover:border-black/20 dark:border-white/[.12] dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus-within:border-mint-400 dark:hover:border-white/30 ${saving ? 'opacity-60' : ''} ${className}`}
    >
      <span aria-hidden="true" className="pr-7 pl-3.5 tabular-nums">
        {state.wanted}
      </span>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-zinc-500" />
      <label htmlFor={id} className="sr-only">
        Show amounts in
      </label>
      <select
        id={id}
        value={state.wanted}
        disabled={saving}
        title="Show amounts in"
        onChange={(event) => {
          const code = event.target.value
          startTransition(async () => {
            await setCurrency(code)
            router.refresh()
          })
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code}: {currency.name}
          </option>
        ))}
      </select>
    </span>
  )
}
