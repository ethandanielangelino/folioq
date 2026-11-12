// Server-only: remembers, for a few minutes, that someone has just come in
// through a password-reset email. While that holds they may choose a new
// password without typing the old one (which is the one thing they've lost).
//
// The note is a cookie signed with a server secret, so it can't be made up
// in the browser, and it names the account it was issued for.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const NAME = 'fq_recovery'
const MINUTES = 20

function sign(payload: string): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createHmac('sha256', `folioq-recovery:${secret}`).update(payload).digest('base64url')
}

/** Call right after a reset link has been verified for this user. */
export async function markRecovery(userId: string): Promise<void> {
  const payload = `${userId}.${Date.now() + MINUTES * 60_000}`
  const signature = sign(payload)
  if (!signature) return
  ;(await cookies()).set(NAME, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MINUTES * 60,
  })
}

/** True while this user's reset link is still fresh. */
export async function inRecovery(userId: string): Promise<boolean> {
  const value = (await cookies()).get(NAME)?.value
  if (!value) return false

  const cut = value.lastIndexOf('.')
  const payload = value.slice(0, cut)
  const given = Buffer.from(value.slice(cut + 1))
  const expected = Buffer.from(sign(payload) ?? '')
  if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return false
  }

  const [owner, expires] = payload.split('.')
  return owner === userId && Number(expires) > Date.now()
}

export async function clearRecovery(): Promise<void> {
  try {
    ;(await cookies()).delete(NAME)
  } catch {
    // Called while rendering a page, where cookies can't be changed. It expires by itself.
  }
}
