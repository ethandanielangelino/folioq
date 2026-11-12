'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import GoogleIcon from '@/app/components/google-icon'
import PasswordChecklist from '@/app/components/password-checklist'
import PasswordInput from '@/app/components/password-input'
import {
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
  textLink,
} from '@/app/components/styles'
import { isValidEmail, passwordError } from '@/lib/credentials'
import { callbackUrl } from '@/lib/routes'
import { createClient } from '@/lib/supabase/client'

export default function SignupForm({ next }: { next: string }) {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setExisting(false)

    if (!fullName.trim() || !email || !password || !confirmPassword) {
      setError('Fill in your name, email, and the password twice.')
      return
    }
    if (!isValidEmail(email)) {
      setError('That email address doesn’t look right. Check it for typos.')
      return
    }
    const weak = passwordError(password)
    if (weak) {
      setError(weak)
      return
    }
    if (password !== confirmPassword) {
      setError('The two passwords don’t match. Type the same password in both boxes.')
      return
    }
    if (!agreedToTerms) {
      setError('Tick the box to agree to the Terms of Service and Privacy Policy.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // has_password: this account can log in with email and password from day one.
      options: { data: { full_name: fullName.trim(), has_password: true } },
    })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    // Supabase answers a sign-up for an address that is already registered
    // with a user that has no identities, rather than an error.
    if (data.user && data.user.identities?.length === 0) {
      setLoading(false)
      setExisting(true)
      return
    }

    // With email confirmation switched off the account is usable immediately.
    if (data.session) {
      router.replace(next)
      router.refresh()
      return
    }

    setLoading(false)
    setSent(true)
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

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-3xl border border-mint-500/40 bg-mint-50 p-6 dark:bg-mint-900/25"
      >
        <MailCheck className="h-6 w-6 text-mint-700 dark:text-mint-300" aria-hidden="true" />
        <p className="mt-3 text-lg font-semibold text-black dark:text-zinc-50">Check your email</p>
        <p className="mt-1.5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Open it on
          this device to finish creating your account.
        </p>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Wrong address?{' '}
          <button type="button" onClick={() => setSent(false)} className={textLink}>
            Go back and change it
          </button>
        </p>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className={fieldLabel}>Full name</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={fieldLabel}>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>

        <div className="flex flex-col gap-2">
          <label htmlFor="signup-password" className={fieldLabel}>
            Password
          </label>
          <PasswordInput
            id="signup-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordChecklist password={password} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="signup-confirm" className={fieldLabel}>
            Confirm password
          </label>
          <PasswordInput
            id="signup-confirm"
            name="confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Doesn’t match yet.</p>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-mint-700"
          />
          <span>
            I agree to the{' '}
            <Link
              href="/terms"
              target="_blank"
              className="font-medium text-black underline underline-offset-4 dark:text-zinc-50"
            >
              Terms of Service and Privacy Policy
            </Link>
          </span>
        </label>

        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
        {existing && (
          <p role="alert" className={errorText}>
            An account with this email already exists.{' '}
            <Link href="/login" className="font-medium underline underline-offset-4">
              Log in instead
            </Link>
            , or{' '}
            <Link href="/forgot-password" className="font-medium underline underline-offset-4">
              reset the password
            </Link>
            .
          </p>
        )}

        <button type="submit" disabled={loading} className={`${primaryButton} mt-1 w-full py-3.5`}>
          {loading ? 'Creating your account…' : 'Create account'}
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
