'use client'

import { createContext, useContext, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { setCurrency } from '@/app/actions/currency'
import AnimatedNumber from '@/app/components/motion/animated-number'
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
import { COINBASE, FINNHUB, GOLD_API, KRAKEN, directExchanges } from '@/lib/price-sources'

const DEFAULT: MoneyState = { ...USD, source: 'usd', asOf: '', wanted: 'USD', provider: null }
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

/**
 * Like <Amount>, but when the figure changes (switching which portfolio the
 * home page shows) it counts to the new value instead of jumping.
 */
export function RollingAmount({ value }: { value: number }) {
  const current = useMoney()
  return <AnimatedNumber value={value} format={(v) => money(v, current)} />
}

/** Where the full explanation of prices and exchange rates lives. */
const ABOUT_PRICES = '/terms#prices'

function AboutPrices() {
  return (
    <Link href={ABOUT_PRICES} className="underline underline-offset-2">
      About prices
    </Link>
  )
}

/** A source named in a note, linked to its site. */
function Source({ source }: { source: { name: string; url: string } }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {source.name}
    </a>
  )
}

/** "Finnhub for shares and funds, Coinbase or Kraken for crypto, gold-api.com for gold and silver" */
function UsdSources() {
  return (
    <>
      <Source source={FINNHUB} /> for shares and funds, <Source source={COINBASE} /> or{' '}
      <Source source={KRAKEN} /> for crypto, <Source source={GOLD_API} /> for gold and silver
    </>
  )
}

/**
 * The note shown wherever amounts appear: prices are estimates, where they
 * come from, and, when another currency is chosen, which crypto is quoted
 * directly in it and which figures are converted, at what rate, from which
 * site. The full explanation is a link away.
 */
export function RateNote({
  className = '',
  pointToSettings = true,
}: {
  className?: string
  /** Say where the currency can be changed. Off on the settings page itself. */
  pointToSettings?: boolean
}) {
  const state = useMoney()

  if (state.source === 'usd') {
    return (
      <p className={className}>
        Prices are estimates from public market data, in US dollars: <UsdSources />. <AboutPrices />
      </p>
    )
  }

  if (state.source === 'unavailable') {
    return (
      <p className={className}>
        Prices are estimates from public market data, in US dollars: <UsdSources />. Exchange rates for{' '}
        {state.wanted} can&apos;t be reached right now, so amounts are in US dollars. <AboutPrices />
      </p>
    )
  }

  const stamp = when(state)
  const direct = directExchanges(state.code)
  return (
    <p className={className}>
      Prices are estimates from public market data. Shares, funds, gold and silver are priced in US
      dollars (<Source source={FINNHUB} />, <Source source={GOLD_API} />) and shown in {state.code} at{' '}
      {describeRate(state)}
      {state.source === 'live' ? ` (live${stamp ? `, ${stamp}` : ''})` : ` (daily reference${stamp ? `, ${stamp}` : ''})`}
      {state.provider && (
        <>
          {' '}
          from <Source source={state.provider} />
        </>
      )}
      .{' '}
      {direct.length > 0 ? (
        <>
          Crypto is priced directly in {state.code} where{' '}
          {direct.map((source, i) => (
            <span key={source.name}>
              {i > 0 && (i === direct.length - 1 ? ' or ' : ', ')}
              <Source source={source} />
            </span>
          ))}{' '}
          trades it, and otherwise converted from <Source source={COINBASE} /> or <Source source={KRAKEN} />
          &apos;s US-dollar price.
        </>
      ) : (
        <>
          Crypto is converted the same way from <Source source={COINBASE} /> or <Source source={KRAKEN} />
          &apos;s US-dollar price: none of the exchanges FolioQ uses quotes it directly in {state.code}.
        </>
      )}{' '}
      <AboutPrices />
      {pointToSettings && (
        <>
          {' '}
          <Link href="/account" className="underline underline-offset-2">
            Change currency
          </Link>
        </>
      )}
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
