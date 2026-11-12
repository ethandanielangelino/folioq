import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. It bypasses row level security, so only use it in
 * server code that has already decided the caller may see the data:
 * the cron job (checked by CRON_SECRET) and shared links (checked by token).
 * Never import this from a client component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
