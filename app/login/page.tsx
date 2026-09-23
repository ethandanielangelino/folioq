'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import GoogleIcon from '@/app/components/google-icon'
import PasswordInput from '@/app/components/password-input'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

  async function handleGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <Card className="block w-full max-w-sm gap-0 rounded-3xl border border-black/[.08] bg-white p-10 shadow-sm ring-0 dark:border-white/[.08] dark:bg-zinc-900">
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
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Log in to your FolioQ account
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-5">
          <Input
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-auto w-full rounded-2xl border-black/[.08] bg-white px-5 py-3.5 text-sm text-black placeholder:text-zinc-400 focus-visible:border-black/[.2] focus-visible:ring-0 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:border-white/[.3]"
          />
          <PasswordInput
            placeholder="Password"
            value={password}
            onChange={setPassword}
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <Button
          onClick={handleLogin}
          disabled={loading}
          className="mt-7 h-auto w-full rounded-full bg-black px-5 py-3.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <div className="my-8 flex items-center gap-3">
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.08]" />
          <span className="text-xs text-zinc-400 dark:text-zinc-500">or</span>
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.08]" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          className="flex h-auto w-full items-center justify-center gap-3 rounded-full border-black/[.08] bg-white px-5 py-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 hover:text-zinc-800 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Do not have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-black underline dark:text-zinc-50"
          >
            Sign up here
          </Link>
        </p>
      </Card>
    </div>
  )
}
