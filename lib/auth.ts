import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * The signed-in user for this request, or null. Cached per request so the
 * layout and the page can both ask without a second round trip.
 */
export const getSessionUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Whether this account can already log in with an email and password. Email
 * sign-ups always can; an account that began with Google can once a password
 * has been set from account settings.
 */
export function hasPassword(user: {
  app_metadata?: { providers?: string[] }
  user_metadata?: Record<string, unknown>
}): boolean {
  return (
    (user.app_metadata?.providers ?? []).includes('email') ||
    user.user_metadata?.has_password === true
  )
}

/** The name someone gave at sign-up (or their Google name), if any. */
export function displayName(user: { user_metadata?: Record<string, unknown> }): string | null {
  const meta = user.user_metadata ?? {}
  const name = meta.full_name ?? meta.name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
