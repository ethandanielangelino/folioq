'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import GoogleIcon from '@/app/components/google-icon'
import PasswordInput from '@/app/components/password-input'
import {
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
  textLink,
} from '@/app/components/styles'
import { isValidEmail } from '@/lib/credentials'
import { callbackUrl } from '@/lib/routes'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm({
  next,
  notice,
  confirmation,
}: {
  next: string
  /** Why a link that led here didn't work. Shown as an error. */
  notice: string | null
  /** Something that went right, such as a password change. */
  confirmation: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(notice ?? '')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }
    if (!isValidEmail(email)) {
      setError('That email address doesn’t look right. Check it for typos.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      setLoading(false)
      setError(
        error.message === 'Invalid login credentials'
          ? 'That email and password don’t match an account.'
          : error.message
      )
      return
    }

    // Stay in the "Logging in…" state until the next page takes over.
    router.replace(next)
    router.refresh()
  }

  async function onGoogle() {
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(next),
      },
    })
    if (error) setError(error.message)
  }

  return (
    <>
      {confirmation && (
        <p
          role="status"
          className="mb-6 rounded-2xl border border-mint-500/40 bg-mint-50 px-4 py-3 text-sm leading-6 text-mint-900 dark:bg-mint-900/25 dark:text-mint-200"
        >
          {confirmation}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className={fieldLabel}>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor="login-password" className={fieldLabel}>
              Password
            </label>
            <Link href="/forgot-password" className={`${textLink} text-sm`}>
              Forgot it?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${primaryButton} mt-1 w-full py-3.5`}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <div className="my-7 flex items-center gap-3">
        <div className="h-px flex-1 bg-black/[.1] dark:bg-white/[.1]" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">or</span>
        <div className="h-px flex-1 bg-black/[.1] dark:bg-white/[.1]" />
      </div>

      <button type="button" onClick={onGoogle} className={`${outlineButton} w-full gap-3 py-3.5`}>
        <GoogleIcon />
        Continue with Google
      </button>
    </>
  )
}
