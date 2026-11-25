'use client'

import { ChevronDown } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { field } from '@/app/components/styles'
import { inOwn as inCurrency } from '@/app/dashboard/[id]/cash-choice'
import { CURRENCIES, USD, type Money } from '@/lib/currency'
import type { DatedPrice } from '@/lib/dated-price'
import { formatMoney } from '@/lib/format'

/** Whether an amount is entered as how many (shares, coins, ounces) or as money. */
export type EnterBy = 'units' | 'money'

/**
 * A small two-way switch beside an amount's label: enter how many, or enter
 * the money and let FolioQ work out how many.
 */
export function EnterBySwitch({
  value,
  onChange,
  unitsLabel,
  moneyLabel,
}: {
  value: EnterBy
  onChange: (next: EnterBy) => void
  /** "Coins", "Shares", "Ounces". */
  unitsLabel: string
  /** "Amount spent", "Total paid". */
  moneyLabel: string
}) {
  const options: { value: EnterBy; label: string }[] = [
    { value: 'units', label: unitsLabel },
    { value: 'money', label: moneyLabel },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Enter it as"
      className="inline-flex shrink-0 rounded-full bg-black/[.05] p-0.5 dark:bg-white/[.08]"
    >
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,box-shadow] duration-200 ${
              on
                ? 'bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A money amount with its currency beside it: a choice of currencies, or just
 * the one when it is fixed (paying from a cash line spends that line's currency).
 */
export function MoneyInput({
  id,
  value,
  onChange,
  currency,
  currencies,
  onCurrency,
  placeholder = '500',
}: {
  id: string
  value: string
  onChange: (next: string) => void
  currency: string
  /** The currencies it may be in. One means it is fixed. */
  currencies: string[]
  onCurrency: (next: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0.01"
        step="any"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={field}
      />
      {currencies.length > 1 ? (
        <CurrencySelect value={currency} onChange={onCurrency} options={currencies} />
      ) : (
        <span className="flex w-28 shrink-0 items-center justify-center rounded-2xl border border-black/[.08] text-sm font-medium text-zinc-600 dark:border-white/[.12] dark:text-zinc-300">
          {short(currency)}
        </span>
      )}
    </div>
  )
}

const short = (code: string) => (code === 'USD' ? 'US$' : code)

/**
 * A narrow currency choice to sit beside an amount. The box shows just the
 * code; the real <select> lies invisibly over it, so the list that opens is
 * the device's own, with each currency's full name.
 */
export function CurrencySelect({
  value,
  onChange,
  options,
  label = 'Currency',
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  label?: string
}) {
  return (
    <span className="relative flex w-28 shrink-0 items-center rounded-2xl border border-black/[.1] bg-white text-sm text-black transition-[border-color,box-shadow] focus-within:border-mint-600 focus-within:ring-4 focus-within:ring-mint-500/15 hover:border-black/25 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus-within:border-mint-400 dark:hover:border-white/30">
      <span aria-hidden="true" className="pr-8 pl-4 font-medium tabular-nums">
        {short(value)}
      </span>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-500" />
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-2xl opacity-0"
      >
        {options.map((code) => (
          <option key={code} value={code}>
            {code}: {CURRENCIES.find((c) => c.code === code)?.name ?? code}
          </option>
        ))}
      </select>
    </span>
  )
}

const linkStyle = 'underline underline-offset-2'

function SourceLink({ source }: { source: { name: string; url: string } }) {
  if (!source.url) return <>{source.name}</>
  const external = source.url.startsWith('http')
  return (
    <a href={source.url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={linkStyle}>
      {source.name}
    </a>
  )
}

/**
 * Where a looked-up price came from, as words to follow "the live price now,":
 * the exchange chosen for a coin and its market; a share's own market and
 * currency; a coin quoted directly in your currency on a named exchange; or a
 * named US-dollar source, converted at today's rate from a named site. Then
 * anything worth saying about it, such as how USDT was counted.
 */
export function PriceOrigin({ market }: { market: Extract<DatedPrice, { ok: true }> }) {
  const money = useMoney()
  const source = market.source
  const note = market.note ? ` (${market.note.replace(/\.$/, '')})` : ''
  if (source.venue) {
    return (
      <>
        on <SourceLink source={source} />
        {source.pair ? `’s ${source.pair} market` : ''}
        {note}
      </>
    )
  }
  if (market.quoted && source.currency) {
    return (
      <>
        from <SourceLink source={source} />, in {source.currency} as the market quotes it{note}
      </>
    )
  }
  if (market.quoted) {
    return (
      <>
        quoted directly in {market.quoted.currency} on <SourceLink source={source} />
        {source.pair ? `’s ${source.pair} market` : ''}
        {note}
      </>
    )
  }
  if (money.code === 'USD') {
    return (
      <>
        from <SourceLink source={source} />
        {note}
      </>
    )
  }
  return (
    <>
      from <SourceLink source={source} /> in US dollars ({formatMoney(market.price, USD)}), converted to{' '}
      {money.code} at today&apos;s rate
      {money.provider && (
        <>
          {' '}
          from <SourceLink source={money.provider} />
        </>
      )}
      {note}
    </>
  )
}

/**
 * A looked-up price in the display currency: exactly as quoted when quoted in
 * it, and when quoted in another currency (won on Upbit, Singapore dollars on
 * SGX), that figure with the display-currency equivalent after it.
 */
export function shownPrice(market: Extract<DatedPrice, { ok: true }>, money: Money): string {
  if (!market.quoted) return formatMoney(market.price, money)
  const quoted = inCurrency(market.quoted.price, market.quoted.currency)
  return market.quoted.currency === money.code ? quoted : `${quoted} (${formatMoney(market.price, money)})`
}

/** Every currency an amount can be typed in: yours first, then US dollars, then the rest. */
export function moneyCurrencies(display: string): string[] {
  const first = display === 'USD' ? ['USD'] : [display, 'USD']
  return [...first, ...CURRENCIES.map((c) => c.code).filter((code) => !first.includes(code))]
}
