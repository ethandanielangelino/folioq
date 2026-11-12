import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import AskBar from '@/app/components/app/ask-bar'
import QMark from '@/app/components/app/q-mark'
import RecordTrack, { type RecordPart } from '@/app/components/app/record-track'
import Wiggle from '@/app/components/motion/wiggle'
import Delta from '@/app/components/portfolio/delta'
import LiveSync from '@/app/components/portfolio/live-sync'
import Sparkline from '@/app/components/portfolio/sparkline'
import { card, primaryButton } from '@/app/components/styles'
import PortfolioFormDialog from '@/app/dashboard/portfolio-form-dialog'
import { displayName, getSessionUser } from '@/lib/auth'
import { getPortfolioCards, type PortfolioCard } from '@/lib/data'
import { formatMoney } from '@/lib/format'
import { getSharedWithMe, timeLeft } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

type Props = { searchParams: Promise<{ focus?: string | string[] }> }

/** How many portfolios the home page lists before pointing to the full page. */
const LISTED = 3
const MAX_TASKS = 5

const list = (items: string[]) =>
  items.length <= 2
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`

/** The three parts of a portfolio's record, and the one thing that would move it forward. */
function record(c: PortfolioCard): { parts: RecordPart[]; next: string; href: string; action: string } {
  const page = `/dashboard/${c.portfolio.id}`
  const shared = Boolean(c.portfolio.share_token)
  const parts: RecordPart[] = [
    {
      label: 'Holdings',
      detail: String(c.holdingCount),
      state: c.holdingCount > 0 ? 'done' : 'todo',
    },
    {
      label: 'Theses',
      detail: `${c.thesisCount} of ${c.holdingCount}`,
      state:
        c.holdingCount > 0 && c.missing.length === 0 ? 'done' : c.thesisCount > 0 ? 'partial' : 'todo',
    },
    { label: 'Share link', detail: shared ? 'on' : 'off', state: shared ? 'done' : 'todo' },
  ]

  if (c.holdingCount === 0) {
    return { parts, next: 'Nothing is held yet.', href: page, action: 'Add the first holding' }
  }
  if (c.missing.length > 0) {
    return {
      parts,
      next: `${list(c.missing)} ${c.missing.length === 1 ? 'has' : 'have'} no written thesis.`,
      href: `${page}#theses`,
      action: c.missing.length === 1 ? 'Write the missing thesis' : `Write ${c.missing.length} theses`,
    }
  }
  if (!shared) {
    return {
      parts,
      next: 'Every holding has a thesis. Nobody else can see it yet.',
      href: page,
      action: 'Share it',
    }
  }
  return {
    parts,
    next: 'On record and shared. Keep the holdings and theses current.',
    href: page,
    action: 'Open',
  }
}

interface Task {
  key: string
  title: string
  detail: string
  href: string
}

/** Everything that still needs the owner, most important first. */
function tasks(cards: PortfolioCard[]): Task[] {
  const found: Task[] = []
  for (const c of cards) {
    const page = `/dashboard/${c.portfolio.id}`
    const name = c.portfolio.name
    if (c.holdingCount === 0) {
      found.push({
        key: `${c.portfolio.id}-empty`,
        title: `${name} has no holdings yet`,
        detail: 'Add the first one to start the record.',
        href: page,
      })
    }
    if (c.missing.length > 0) {
      found.push({
        key: `${c.portfolio.id}-missing`,
        title: `${list(c.missing)} ${c.missing.length === 1 ? 'has' : 'have'} no thesis`,
        detail: `In ${name}. Nothing on record says why ${c.missing.length === 1 ? 'it is' : 'they are'} held.`,
        href: `${page}#theses`,
      })
    }
  }
  for (const c of cards) {
    const page = `/dashboard/${c.portfolio.id}`
    if (c.drafts.length > 0) {
      found.push({
        key: `${c.portfolio.id}-drafts`,
        title: `${list(c.drafts)} ${c.drafts.length === 1 ? 'is' : 'are'} still an AI draft`,
        detail: `In ${c.portfolio.name}. Rewrite ${c.drafts.length === 1 ? 'it' : 'them'} in your own words.`,
        href: `${page}#theses`,
      })
    }
    if (!c.portfolio.mandate?.trim()) {
      found.push({
        key: `${c.portfolio.id}-purpose`,
        title: `${c.portfolio.name} doesn’t say what it’s for`,
        detail: 'One sentence of purpose lets the assistant tailor its answers.',
        href: `${page}?edit=purpose`,
      })
    }
  }
  return found
}

const tab =
  'shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors aria-[current=true]:bg-black aria-[current=true]:text-white dark:aria-[current=true]:bg-white dark:aria-[current=true]:text-black'
const idleTab =
  'text-zinc-600 hover:bg-black/[.05] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.07] dark:hover:text-zinc-50'

export default async function DashboardHome({ searchParams }: Props) {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard')

  const supabase = await createClient()
  const [cards, shared] = await Promise.all([
    getPortfolioCards(supabase, { ownerId: user.id }),
    getSharedWithMe(supabase),
  ])
  const invites = (shared ?? []).filter((s) => s.status === 'pending')

  const params = await searchParams
  const focusParam = Array.isArray(params.focus) ? params.focus[0] : params.focus
  const focus = cards.find((c) => c.portfolio.id === focusParam) ?? null
  const scope = focus ? [focus] : cards

  const firstName = displayName(user)?.split(/\s+/)[0]
  const total = scope.reduce(
    (sum, c) => ({
      value: sum.value + c.totals.marketValue,
      day: sum.day + c.totals.dayChange,
      holdings: sum.holdings + c.holdingCount,
    }),
    { value: 0, day: 0, holdings: 0 }
  )
  const previous = total.value - total.day

  // The assistant talks about the chosen portfolio, or the largest one when looking at all.
  const subject =
    focus ?? [...cards].sort((a, b) => b.totals.marketValue - a.totals.marketValue)[0] ?? null
  // Invitations come first: they lapse after a week.
  const waiting: Task[] = [
    ...(focus
      ? []
      : invites.map((invite) => ({
          key: `invite-${invite.memberId}`,
          title: `${invite.ownerName} invited you to ${invite.portfolioName}`,
          detail: `Accept or decline. ${timeLeft(invite.expiresAt)} left.`,
          href: '/dashboard/shared',
        }))),
    ...tasks(scope),
  ]
  const shown = focus ? scope : cards.slice(0, LISTED)

  // New invites, and changes made by people you share with, show up as they happen.
  const live = (
    <LiveSync
      name={`home:${user.id}`}
      watch={[{ table: 'portfolio_members', filter: `user_id=eq.${user.id}` }, { table: 'holdings' }]}
    />
  )

  if (cards.length === 0) {
    return (
      <div className="stage relative overflow-hidden rounded-[2.5rem] px-6 py-14 sm:px-12 sm:py-20">
        <div aria-hidden="true" className="rings pointer-events-none absolute inset-0" />
        <div className="relative max-w-2xl">
          <h1 className="text-[2.5rem] leading-[1.08] text-black sm:text-6xl dark:text-zinc-50">
            {firstName ? `Welcome, ${firstName}.` : 'Welcome.'} Start with one portfolio.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-700 dark:text-zinc-300">
            A portfolio is one pot of money you answer for: a club fund, a class project, a family
            account. Name it, say what it is for, then add what it holds and why.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <PortfolioFormDialog triggerLabel="Create a portfolio" triggerClassName={`${primaryButton} px-7 py-3.5`} />
            {(shared ?? []).length > 0 && (
              <Link
                href="/dashboard/shared"
                className="text-sm font-medium text-mint-800 underline-offset-4 hover:underline dark:text-mint-200"
              >
                {invites.length > 0
                  ? `${invites.length === 1 ? '1 invitation is' : `${invites.length} invitations are`} waiting for you`
                  : 'See what is shared with you'}
              </Link>
            )}
          </div>
        </div>
        {live}
      </div>
    )
  }

  return (
    <>
      {live}
      <header>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {firstName ? `${firstName}, you answer for` : 'You answer for'}
        </p>
        <h1 className="mt-3 text-[3.25rem] leading-[1.05] text-black tabular-nums sm:text-7xl dark:text-zinc-50">
          {formatMoney(total.value)}
        </h1>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            {focus
              ? `in ${focus.portfolio.name}, ${total.holdings === 1 ? '1 holding' : `${total.holdings} holdings`}.`
              : `across ${cards.length === 1 ? '1 portfolio' : `${cards.length} portfolios`} and ${total.holdings === 1 ? '1 holding' : `${total.holdings} holdings`}.`}
          </span>
          {total.holdings > 0 && (
            <span className="tabular-nums">
              Today{' '}
              <Delta amount={total.day} ratio={previous > 0 ? total.day / previous : null} />
            </span>
          )}
        </p>

        {cards.length > 1 && (
          <nav
            aria-label="Choose a portfolio"
            className="-mx-1 mt-6 flex gap-1 overflow-x-auto px-1 pb-1"
          >
            <Link
              href="/dashboard"
              scroll={false}
              aria-current={focus === null}
              className={`${tab} ${focus === null ? '' : idleTab}`}
            >
              All portfolios
            </Link>
            {cards.map((c) => (
              <Link
                key={c.portfolio.id}
                href={`/dashboard?focus=${c.portfolio.id}`}
                scroll={false}
                aria-current={focus?.portfolio.id === c.portfolio.id}
                className={`${tab} ${focus?.portfolio.id === c.portfolio.id ? '' : idleTab}`}
              >
                {c.portfolio.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* The assistant: ask straight from here. */}
      {subject && (
        <section
          aria-label="Ask the assistant"
          className="relative mt-8 overflow-hidden rounded-[1.75rem] bg-black px-6 py-8 shadow-xl shadow-black/15 sm:px-10 sm:py-10 dark:bg-zinc-900"
        >
          <div aria-hidden="true" className="rings rings-on-ink pointer-events-none absolute inset-0" />
          <div className="relative grid items-center gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex items-center gap-5">
              <QMark className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />
              <div className="min-w-0">
                <p className="text-2xl leading-[1.3] text-zinc-50 [font-family:var(--font-serif),serif] sm:text-[1.7rem]">
                  {subject.holdingCount === 0
                    ? `Add a holding to ${subject.portfolio.name} and I’ll have something to read.`
                    : `I’ve read ${subject.portfolio.name}. What do you want to test?`}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {subject.holdingCount > 0 && !subject.portfolio.mandate?.trim() ? (
                    <>
                      <Link
                        href={`/dashboard/${subject.portfolio.id}?edit=purpose`}
                        className="font-medium text-mint-300 underline-offset-4 hover:underline"
                      >
                        Say what it is for
                      </Link>{' '}
                      and the answers get more specific.
                    </>
                  ) : (
                    'The assistant questions your reasoning. It never gives financial advice.'
                  )}
                </p>
              </div>
            </div>

            {subject.holdingCount > 0 ? (
              <AskBar portfolioId={subject.portfolio.id} portfolioName={subject.portfolio.name} />
            ) : (
              <div>
                <Link
                  href={`/dashboard/${subject.portfolio.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-mint-300 px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-mint-200"
                >
                  Open {subject.portfolio.name}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-10 grid items-start gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl text-black dark:text-zinc-50">
              {focus ? 'Where the record stands' : 'Your portfolios'}
            </h2>
            <Link
              href="/dashboard/portfolios"
              className="rounded text-sm font-medium text-mint-700 underline-offset-4 hover:underline dark:text-mint-300"
            >
              {cards.length > shown.length ? `All ${cards.length} portfolios` : 'All portfolios'}
            </Link>
          </div>

          <ul className="mt-4 flex flex-col gap-4">
            {shown.map((c) => {
              const state = record(c)
              return (
                <li key={c.portfolio.id}>
                  <Wiggle tilt={2} shake={0.35}>
                    <article className={`${card} p-5 sm:p-6`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-xl leading-snug text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">
                            <Link
                              href={`/dashboard/${c.portfolio.id}`}
                              className="rounded underline-offset-4 hover:underline"
                            >
                              {c.portfolio.name}
                            </Link>
                          </h3>
                          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-2xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
                              {formatMoney(c.totals.marketValue)}
                            </span>
                            {c.holdingCount > 0 && (
                              <span className="text-sm tabular-nums">
                                <Delta amount={c.totals.dayChange} ratio={c.totals.dayChangePct} />
                                <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">today</span>
                              </span>
                            )}
                          </p>
                        </div>
                        <Sparkline points={c.history} />
                      </div>

                      <div className="mt-5">
                        <RecordTrack parts={state.parts} />
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                        <p className="min-w-0 flex-1 basis-56 text-sm text-zinc-600 dark:text-zinc-400">
                          {state.next}
                        </p>
                        <Link
                          href={state.href}
                          className="group inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-medium text-mint-700 dark:text-mint-300"
                        >
                          <span className="underline-offset-4 group-hover:underline">{state.action}</span>
                          <ArrowRight
                            aria-hidden="true"
                            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                          />
                        </Link>
                      </div>
                    </article>
                  </Wiggle>
                </li>
              )
            })}
          </ul>

          <div className="mt-5">
            <PortfolioFormDialog
              triggerLabel="New portfolio"
              triggerClassName="rounded-full border border-dashed border-black/25 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-mint-600 hover:text-mint-800 dark:border-white/30 dark:text-zinc-300 dark:hover:border-mint-400 dark:hover:text-mint-200"
            />
          </div>
        </section>

        <section>
          <h2 className="text-2xl text-black dark:text-zinc-50">Waiting on you</h2>
          {waiting.length === 0 ? (
            <div className={`${card} mt-4 flex items-start gap-4 p-5`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint-600/[.12] text-mint-700 dark:bg-mint-400/[.14] dark:text-mint-300">
                <Check className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-black dark:text-zinc-50">Nothing right now</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Every holding has a thesis in your own words, and each portfolio says what it is
                  for.
                </p>
              </div>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2.5">
              {waiting.slice(0, MAX_TASKS).map((task) => (
                <li key={task.key}>
                  <Link
                    href={task.href}
                    className="group flex items-center gap-3.5 rounded-2xl border border-black/[.07] bg-white px-4 py-3.5 transition-[border-color] hover:border-mint-600/50 dark:border-white/[.08] dark:bg-zinc-900 dark:hover:border-mint-400/50"
                  >
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-deep" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-black dark:text-zinc-50">
                        {task.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                        {task.detail}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
              {waiting.length > MAX_TASKS && (
                <li className="px-1 pt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  And {waiting.length - MAX_TASKS} more across your portfolios.
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
