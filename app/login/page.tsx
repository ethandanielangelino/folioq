'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="max-w-sm mx-auto mt-24 p-6">
      <h1 className="text-xl font-medium mb-6">Log in to FolioQ</h1>

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
        onClick={handleLogin}
        disabled={loading}
        className="w-full bg-black text-white rounded py-2 disabled:opacity-50"
      >
        {loading ? 'Logging in…' : 'Log in'}
      </button>

      <p className="text-sm text-gray-600 mt-4">
        No account? <Link href="/signup" className="underline">Sign up</Link>
      </p>
    </main>
  )
}