'use client'

import Link from 'next/link'
import { motion } from 'motion/react'

/**
 * The row of portfolio tabs on the home page. The dark pill behind the
 * chosen tab slides to the next one instead of jumping.
 */
export default function FocusTabs({
  portfolios,
  focusId,
}: {
  portfolios: { id: string; name: string }[]
  focusId: string | null
}) {
  const options = [{ id: null as string | null, name: 'All portfolios' }, ...portfolios]

  return (
    <nav aria-label="Choose a portfolio" className="-mx-1 mt-6 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const active = option.id === focusId
        return (
          <Link
            key={option.id ?? 'all'}
            href={option.id ? `/dashboard?focus=${option.id}` : '/dashboard'}
            scroll={false}
            aria-current={active}
            className={`relative isolate shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              active
                ? 'text-white dark:text-black'
                : 'text-zinc-600 hover:bg-black/[.05] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.07] dark:hover:text-zinc-50'
            }`}
          >
            {active && (
              <motion.span
                layoutId="focus-pill"
                aria-hidden="true"
                transition={{ type: 'spring', stiffness: 480, damping: 40, mass: 0.7 }}
                className="absolute inset-0 -z-10 rounded-full bg-black dark:bg-white"
              />
            )}
            {option.name}
          </Link>
        )
      })}
    </nav>
  )
}
