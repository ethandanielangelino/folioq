'use client'

import { outlineButton, primaryButton } from '@/app/components/styles'

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Your portfolios couldn&apos;t be loaded
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        The database didn&apos;t answer. Nothing has been lost. Try again in a moment — if this
        keeps happening, the database may be paused or its tables may not be set up yet.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={reset} className={primaryButton}>
          Try again
        </button>
        {/* A full page load, on purpose: it clears the failed render. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={outlineButton}>
          Back to home
        </a>
      </div>
    </div>
  )
}
