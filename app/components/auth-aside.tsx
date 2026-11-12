'use client'

import Wiggle from '@/app/components/motion/wiggle'
import { formatPercent } from '@/lib/format'
import { sampleHoldings } from '@/lib/sample'

const holding = sampleHoldings.find((h) => h.thesis) ?? sampleHoldings[0]

/** The illustration beside the account forms: one sample thesis you can pick up. */
export default function AuthAside() {
  const thesis = holding.thesis
  return (
    <div className="stage relative flex h-full min-h-[36rem] items-center justify-center overflow-hidden rounded-[2.5rem] p-10">
      <div aria-hidden="true" className="rings pointer-events-none absolute inset-0" />
      <figure className="relative w-full max-w-sm">
        <Wiggle draggable float={6} tilt={6}>
          <div className="overflow-hidden rounded-[1.75rem] border border-black/[.06] bg-white shadow-2xl shadow-black/20 select-none dark:border-white/[.1] dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
              <div>
                <p className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
                  {holding.ticker}
                </p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{holding.name}</p>
              </div>
              <p className="rounded-full bg-mint-100 px-3 py-1 text-sm font-medium text-mint-800 tabular-nums dark:bg-mint-900/60 dark:text-mint-200">
                {formatPercent(holding.weight)}
              </p>
            </div>
            {thesis && (
              <div className="bg-black px-6 py-5 text-zinc-100 dark:bg-zinc-950">
                <p className="text-xs text-mint-300">Why the fund holds it</p>
                <p className="mt-2 text-[1.05rem] leading-7 [font-family:var(--font-serif),serif]">
                  {thesis.claim}
                </p>
                <p className="mt-4 text-xs text-zinc-400">What could go wrong</p>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm leading-6 text-zinc-300 marker:text-mint-400">
                  {thesis.risks.slice(0, 2).map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Wiggle>
        <figcaption className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-400">
          A holding and its written reason, from the sample fund.
        </figcaption>
      </figure>
    </div>
  )
}
