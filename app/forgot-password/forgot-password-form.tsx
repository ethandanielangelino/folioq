'use client'

import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { errorText, field, fieldLabel, primaryButton } from '@/app/components/styles'
import { isValidEmail } from '@/lib/credentials'
import { callbackUrl } from '@/lib/routes'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!isValidEmail(email)) {
      setError('Enter the email address you signed up with.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    // The link signs the person in, then lands on account settings to pick a new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl('/account?reset=1'),
    })
    setLoading(false)

    if (error) setError(error.message)
    else setSent(true)
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
          If an account exists for <span className="font-medium">{email}</span>, a reset link is
          on its way. Open it on this device.
        </p>
      </div>
    )
  }

  return (
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

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className={`${primaryButton} mt-1 w-full py-3.5`}>
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}
