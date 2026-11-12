import { NextResponse } from 'next/server'
import { markRecovery } from '@/lib/recovery'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/routes'

/**
 * Where Google sign-in and emailed links (password reset) come back to.
 * Trades the one-time code for a session, then continues to `next`.
 */
const RESET_DESTINATION = /^\/account\?(?:.*&)?reset=1(?:&|$)/

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Coming back from a password-reset email: note it, so the account page
      // lets them choose a new password without the one they have forgotten.
      if (RESET_DESTINATION.test(next) && data.user) await markRecovery(data.user.id)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  const failure = next.startsWith('/account') ? 'invalid_link' : 'oauth_failed'
  return NextResponse.redirect(`${origin}/login?error=${failure}`)
}
