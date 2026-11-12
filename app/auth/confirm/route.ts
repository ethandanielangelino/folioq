import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { markRecovery } from '@/lib/recovery'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/routes'

/** Where email links that carry a token (sign-up confirmation, password reset) land. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      if (type === 'recovery' && data.user) await markRecovery(data.user.id)
      // A reset link signs the person in; send them to choose the new password.
      const destination =
        type === 'recovery' ? '/account?reset=1' : safeNext(searchParams.get('next'))
      return NextResponse.redirect(new URL(destination, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
}
