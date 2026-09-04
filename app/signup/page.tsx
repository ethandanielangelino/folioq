'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    setError('')
    if (!agreedToTerms) {
      setError('You must agree to the Terms and Services Policy')
      return
    }
    if (!fullName || !email || !password || !confirmPassword) {
      setError('All fields are required')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    setLoading(false)

    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <div className="w-full max-w-sm rounded-3xl border border-black/[.08] bg-white p-10 text-center shadow-sm dark:border-white/[.08] dark:bg-zinc-900">
          <Image
            src="/FolioQ-logo.png"
            alt="FolioQ"
            width={44}
            height={44}
            className="mx-auto h-11 w-11 rounded-xl"
            priority
          />
          <h1 className="mt-6 text-2xl font-semibold text-black dark:text-zinc-50">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            We sent a confirmation link to {email}. Click it to activate your
            account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-3xl border border-black/[.08] bg-white p-10 shadow-sm dark:border-white/[.08] dark:bg-zinc-900">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/FolioQ-logo.png"
            alt="FolioQ"
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl"
            priority
          />
          <h1 className="mt-6 text-2xl font-semibold text-black dark:text-zinc-50">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sign up to get started with FolioQ
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-5">
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-2xl border border-black/[.08] bg-white px-5 py-3.5 text-sm text-black outline-none placeholder:text-zinc-400 focus:border-black/[.2] dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/[.3]"
          />
          <input
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-black/[.08] bg-white px-5 py-3.5 text-sm text-black outline-none placeholder:text-zinc-400 focus:border-black/[.2] dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/[.3]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-black/[.08] bg-white px-5 py-3.5 text-sm text-black outline-none placeholder:text-zinc-400 focus:border-black/[.2] dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/[.3]"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-2xl border border-black/[.08] bg-white px-5 py-3.5 text-sm text-black outline-none placeholder:text-zinc-400 focus:border-black/[.2] dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/[.3]"
          />
        </div>

        <label className="mt-5 flex items-start gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/[.2] text-black focus:ring-black dark:border-white/[.3] dark:bg-zinc-900 dark:text-white dark:focus:ring-white"
          />
          <span>
            By checking this box, I agree to Terms and Services Policy
          </span>
        </label>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={handleSignup}
          disabled={loading || !agreedToTerms}
          className="mt-7 w-full rounded-full bg-black px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? 'Creating…' : 'Sign up'}
        </button>

        <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-black underline dark:text-zinc-50"
          >
            Log in here
          </Link>
        </p>
      </div>
    </div>
  )
}
