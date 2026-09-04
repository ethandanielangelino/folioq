'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    setError('')
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <main className="max-w-sm mx-auto mt-24 p-6">
        <h1 className="text-xl font-medium mb-2">Check your email</h1>
        <p className="text-sm text-gray-600">
          We sent a confirmation link to {email}. Click it to activate your account.
        </p>
      </main>
    )
  }

  return (
    <main className="max-w-sm mx-auto mt-24 p-6">
      <h1 className="text-xl font-medium mb-6">Create your FolioQ account</h1>

      <input
        type="email"
        placeholder="you@university.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded px-3 py-2 mb-3"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded px-3 py-2 mb-3"
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        onClick={handleSignup}
        disabled={loading}
        className="w-full bg-black text-white rounded py-2 disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Sign up'}
      </button>

      <p className="text-sm text-gray-600 mt-4">
        Already have an account? <Link href="/login" className="underline">Log in</Link>
      </p>
    </main>
  )
}