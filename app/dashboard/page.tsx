import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

async function signOut() {
  'use server'

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const initial = (user.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/[.08] dark:border-white/[.08]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
          <div className="flex items-center gap-2.5">
            <Image
              src="/FolioQ-logo.png"
              alt="FolioQ"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
            <span className="text-lg font-semibold text-black dark:text-zinc-50">
              FolioQ
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white dark:bg-white dark:text-black">
                {initial}
              </div>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {user.email}
              </span>
            </div>
            <form action={signOut}>
              <Button
                type="submit"
                variant="outline"
                className="h-auto rounded-full border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-black/[.04] hover:text-zinc-800 dark:border-white/[.145] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[.06] dark:hover:text-zinc-100"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-10 sm:py-16 lg:px-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-black sm:text-4xl dark:text-zinc-50">
            Your portfolios
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Signed in as {user.email}
          </p>
        </div>

        <Card className="mt-10 block gap-0 rounded-3xl border border-dashed border-black/[.12] bg-white px-6 py-20 text-center ring-0 dark:border-white/[.145] dark:bg-zinc-900">
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <svg
                className="h-6 w-6 text-zinc-400 dark:text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </div>
            <h2 className="mt-5 text-lg font-semibold text-black dark:text-zinc-50">
              No portfolios yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Once you add a portfolio, it&apos;ll show up here with holdings,
              allocation, and performance at a glance.
            </p>
            <Button
              type="button"
              className="mt-6 h-auto rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Add a portfolio
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}
