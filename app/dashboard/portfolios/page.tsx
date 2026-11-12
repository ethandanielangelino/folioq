import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import Wiggle from '@/app/components/motion/wiggle'
import Delta from '@/app/components/portfolio/delta'
import Sparkline from '@/app/components/portfolio/sparkline'
import { card } from '@/app/components/styles'
import PortfolioFormDialog from '@/app/dashboard/portfolio-form-dialog'
import { getSessionUser } from '@/lib/auth'
import { getPortfolioCards } from '@/lib/data'
import { formatMoney } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const firstSteps = [
  {
    title: 'Create a portfolio',
    text: 'One pot of money you answer for: a club fund, a class project, a family account.',
  },
  {
    title: 'Add what it holds',
    text: 'A ticker, a share count, and your average cost. Prices fill in the rest.',
  },
  {
    title: 'Write down why',
    text: 'A claim, what has to stay true, and what could go wrong, for each holding.',
  },
]

export const metadata: Metadata = { title: 'Portfolios — FolioQ' }

export default async function PortfoliosPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard/portfolios')

  const supabase = await createClient()
  const cards = await getPortfolioCards(supabase, { ownerId: user.id })

  const combined = cards.reduce(
    (sum, c) => ({
      marketValue: sum.marketValue + c.totals.marketValue,
      dayChange: sum.dayChange + c.totals.dayChange,
      holdings: sum.holdings + c.holdingCount,
      theses: sum.theses + c.thesisCount,
    }),
    { marketValue: 0, dayChange: 0, holdings: 0, theses: 0 }
  )
  const previous = combined.marketValue - combined.dayChange
  const unexplained = combined.holdings - combined.theses

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">
            Portfolios
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {cards.length === 0
              ? `Signed in as ${user.email}`
              : unexplained > 0
                ? `${unexplained === 1 ? '1 holding has' : `${unexplained} holdings have`} no written thesis yet.`
                : combined.holdings > 0
                  ? 'Every holding has a written thesis.'
                  : 'No holdings yet. Open a portfolio to add the first one.'}
          </p>
        </div>
        {cards.length > 0 && <PortfolioFormDialog triggerLabel="New portfolio" />}
      </div>

      {cards.length > 1 && (
        <dl className={`${card} mt-8 grid divide-y divide-black/[.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-white/[.08]`}>
          <div className="px-6 py-5">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Across {cards.length} portfolios
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
              {formatMoney(combined.marketValue)}
            </dd>
          </div>
          <div className="px-6 py-5">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Today</dt>
            <dd className="mt-2 text-lg font-semibold tabular-nums">
              <Delta
                amount={combined.dayChange}
                ratio={previous > 0 ? combined.dayChange / previous : null}
              />
            </dd>
          </div>
          <div className="px-6 py-5">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Holdings with a thesis</dt>
            <dd className="mt-2 text-lg font-semibold text-black tabular-nums dark:text-zinc-50">
              {combined.theses} of {combined.holdings}
            </dd>
          </div>
        </dl>
      )}

      {cards.length === 0 ? (
        <div className="stage relative mt-8 overflow-hidden rounded-[2.5rem] px-6 py-12 sm:px-12 sm:py-16">
          <div aria-hidden="true" className="rings pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="max-w-xl text-3xl leading-[1.12] text-black sm:text-4xl dark:text-zinc-50">
              Start with one portfolio
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {firstSteps.map((step, index) => (
                <li key={step.title}>
                  <Wiggle tilt={5} shake={0.7} className="h-full [&>div]:h-full [&>div>div]:h-full">
                    <div className="h-full rounded-3xl border border-black/[.06] bg-white/90 p-6 shadow-lg shadow-black/[.06] dark:border-white/[.1] dark:bg-zinc-900/90 dark:shadow-none">
                      <span
                        aria-hidden="true"
                        className="text-4xl text-mint-600 [font-family:var(--font-serif),serif] dark:text-mint-400"
                      >
                        {index + 1}
                      </span>
                      <h3 className="mt-2 text-lg font-semibold text-black dark:text-zinc-50">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {step.text}
                      </p>
                    </div>
                  </Wiggle>
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <PortfolioFormDialog triggerLabel="Create a portfolio" />
            </div>
          </div>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 md:grid-cols-2">
          {cards.map(({ portfolio, totals, holdingCount, thesisCount, history }) => {
            const missing = holdingCount - thesisCount
            return (
              <li key={portfolio.id}>
                <Wiggle tilt={3} shake={0.45} className="h-full [&>div]:h-full [&>div>div]:h-full">
                  <Link
                    href={`/dashboard/${portfolio.id}`}
                    className={`${card} group flex h-full flex-col p-6 transition-[border-color,box-shadow] duration-200 hover:border-mint-600/50 hover:shadow-xl hover:shadow-black/[.08] dark:hover:border-mint-400/50`}
                  >
                    <div className="flex min-h-8 items-start justify-between gap-4">
                      <h2 className="text-2xl leading-tight text-black dark:text-zinc-50">
                        {portfolio.name}
                      </h2>
                      <span className="flex shrink-0 items-center gap-2">
                        {portfolio.share_token && (
                          <span className="rounded-full bg-sky-tint px-2.5 py-0.5 text-xs font-medium text-black">
                            Shared
                          </span>
                        )}
                        <ArrowUpRight
                          aria-hidden="true"
                          className="h-5 w-5 text-zinc-400 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-mint-700 dark:group-hover:text-mint-300"
                        />
                      </span>
                    </div>
                    {portfolio.mandate && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                        {portfolio.mandate}
                      </p>
                    )}

                    <div className="mt-auto pt-6">
                      <div className="flex items-end justify-between gap-4">
                        <p className="text-3xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
                          {formatMoney(totals.marketValue)}
                        </p>
                        <Sparkline points={history} />
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm tabular-nums">
                        <div>
                          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Today</dt>
                          <dd className="mt-1">
                            <Delta amount={totals.dayChange} ratio={totals.dayChangePct} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Gain</dt>
                          <dd className="mt-1">
                            <Delta amount={totals.gain} ratio={totals.gainPct} />
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-black/[.06] pt-4 text-xs text-zinc-500 dark:border-white/[.08] dark:text-zinc-400">
                        <span>
                          {holdingCount === 0
                            ? 'No holdings yet'
                            : `${holdingCount === 1 ? '1 holding' : `${holdingCount} holdings`}, ${thesisCount} with a written thesis`}
                        </span>
                        {missing > 0 && (
                          <span className="rounded-full bg-amber-tint/70 px-2.5 py-0.5 font-medium text-black dark:bg-amber-deep/25 dark:text-amber-tint">
                            {missing === 1 ? '1 needs a thesis' : `${missing} need a thesis`}
                          </span>
                        )}
                      </p>
                    </div>
                  </Link>
                </Wiggle>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
