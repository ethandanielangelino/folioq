'use client'

import { useEffect, useState } from 'react'
import { field, fieldLabel } from '@/app/components/styles'
import { getRateOnDate } from '@/app/dashboard/actions'
import { CURRENCIES, money } from '@/lib/currency'
import { isIsoDate } from '@/lib/sale-date'

/** One of the portfolio's cash lines: a currency and how much of it is held. */
export interface CashLine {
  currency: string
  amount: number
}

export const currencyName = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code

/** "S$5,000.00": an amount in its own currency. */
export const inOwn = (amount: number, code: string) => money(amount, { code, rate: 1 })

/** The value meaning "money from outside FolioQ", rather than one of its cash lines. */
export const OUTSIDE = ''

/**
 * Which cash a purchase is paid from by default: the line in the currency
 * amounts are shown in, else US dollars, else any line with money in it.
 */
export function defaultPayFrom(lines: CashLine[], display: string): string {
  const funded = lines.filter((l) => l.amount > 0)
  return (
    funded.find((l) => l.currency === display)?.currency ??
    funded.find((l) => l.currency === 'USD')?.currency ??
    funded[0]?.currency ??
    OUTSIDE
  )
}

/** Where a sale's money can go: the currency amounts are shown in, US dollars, and any existing line. */
export function intoOptions(lines: CashLine[], display: string): string[] {
  return [...new Set([display, 'USD', ...lines.map((l) => l.currency)])]
}

/**
 * Units of `currency` per US dollar on `date`, for previews: 1 for US dollars,
 * undefined while it loads, null if no rate could be found.
 */
export function useRate(currency: string | null, date: string): number | null | undefined {
  const key = `${currency}|${date}`
  const [found, setFound] = useState<{ key: string; rate: number | null } | null>(null)
  useEffect(() => {
    if (!currency || currency === 'USD' || !isIsoDate(date)) return
    let current = true
    getRateOnDate(currency, date).then((rate) => {
      if (current) setFound({ key, rate })
    })
    return () => {
      current = false
    }
  }, [currency, date, key])
  if (!currency) return null
  if (currency === 'USD') return 1
  return found?.key === key ? found.rate : undefined
}

/** A labelled choice of cash line. */
export function CashSelect({
  id,
  label,
  value,
  onChange,
  options,
  lines,
  outside,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  /** Currencies to offer. */
  options: string[]
  lines: CashLine[]
  /** Also offer "money from outside FolioQ", with this wording. */
  outside?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {options.map((code) => {
          const line = lines.find((l) => l.currency === code)
          return (
            <option key={code} value={code}>
              {currencyName(code)} cash{line ? ` (${inOwn(line.amount, code)})` : ''}
            </option>
          )
        })}
        {outside !== undefined && <option value={OUTSIDE}>{outside}</option>}
      </select>
    </div>
  )
}
