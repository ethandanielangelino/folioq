'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { isCurrency } from '@/lib/currency'
import { CURRENCY_COOKIE } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

/**
 * Remembers which currency to show amounts in: in a cookie for this browser,
 * and on the account when someone is signed in, so it follows them.
 */
export async function setCurrency(code: string): Promise<{ ok: boolean }> {
  if (!isCurrency(code)) return { ok: false }

  ;(await cookies()).set(CURRENCY_COOKIE, code, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await supabase.auth.updateUser({ data: { currency: code } })

  revalidatePath('/', 'layout')
  return { ok: true }
}
