// Server-only: which currency this request should show amounts in, and at
// what rate.

import { cache } from 'react'
import { cookies } from 'next/headers'
import { getSessionUser } from '@/lib/auth'
import { isCurrency, type Money } from '@/lib/currency'
import { getRate } from '@/lib/fx'

export const CURRENCY_COOKIE = 'fq_currency'

export interface MoneyState extends Money {
  /**
   * - usd: showing US dollars because that is the choice
   * - live / reference: converted, and which kind of rate was used
   * - unavailable: another currency was chosen but no rate could be fetched,
   *   so amounts are in US dollars until one can
   */
  source: 'usd' | 'live' | 'reference' | 'unavailable'
  /** When the rate is from. Empty for US dollars. */
  asOf: string
  /** The currency the person asked for, which differs from `code` only when unavailable. */
  wanted: string
}

/**
 * The display currency for this request. A signed-in person's choice is kept
 * on their account so it follows them between devices; a cookie covers
 * visitors who aren't signed in (someone opening a public link).
 */
export const getMoney = cache(async (): Promise<MoneyState> => {
  const user = await getSessionUser()
  const saved = user?.user_metadata?.currency
  const fromCookie = (await cookies()).get(CURRENCY_COOKIE)?.value
  const wanted = isCurrency(saved) ? saved : isCurrency(fromCookie) ? fromCookie : 'USD'

  if (wanted === 'USD') return { code: 'USD', rate: 1, source: 'usd', asOf: '', wanted }

  const found = await getRate(wanted)
  if (!found) return { code: 'USD', rate: 1, source: 'unavailable', asOf: '', wanted }
  return { code: wanted, rate: found.rate, source: found.source, asOf: found.asOf, wanted }
})
