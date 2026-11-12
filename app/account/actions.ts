'use server'

import { redirect } from 'next/navigation'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { hasPassword } from '@/lib/auth'
import { passwordError } from '@/lib/credentials'
import { clearRecovery, inRecovery } from '@/lib/recovery'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

/**
 * Sets a new password, then signs the account out everywhere and sends the
 * person to log in again.
 *
 * Who has to prove what:
 * - arrived through a reset email in the last few minutes: nothing more
 * - has never had a password (signed up with Google): nothing more
 * - otherwise: the current password, checked here before anything changes
 */
export async function changePassword(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'Your session has expired. Log in again.' }

  const read = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : ''
  }
  const current = read('current')
  const next = read('next')
  const confirm = read('confirm')

  const problem = passwordError(next)
  if (problem) return { ok: false, error: problem }
  if (next !== confirm) return { ok: false, error: 'The two new passwords don’t match.' }

  const recovering = await inRecovery(user.id)
  if (!recovering && hasPassword(user)) {
    if (!current) return { ok: false, error: 'Enter your current password.' }
    if (current === next) {
      return { ok: false, error: 'The new password is the same as the current one.' }
    }
    // Checked with a throwaway client so this page's own session is untouched.
    const checker = createPlainClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { error } = await checker.auth.signInWithPassword({ email: user.email, password: current })
    if (error) {
      return {
        ok: false,
        error:
          'That isn’t your current password. If you’ve forgotten it, use “Email me a reset link” below.',
      }
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: next,
    // Remembered so an account that began with Google is asked for its
    // current password from now on.
    data: { has_password: true },
  })
  if (error) {
    return {
      ok: false,
      error:
        error.code === 'same_password'
          ? 'The new password is the same as the current one.'
          : error.message || 'Could not save the password. Try again.',
    }
  }

  await clearRecovery()
  // Every device, including this one: the old password's sessions end here.
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login?notice=password_changed')
}
