import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eye, Pencil } from 'lucide-react'
import { Amount, RateNote } from '@/app/components/money'
import Delta from '@/app/components/portfolio/delta'
import LiveSync from '@/app/components/portfolio/live-sync'
import Sparkline from '@/app/components/portfolio/sparkline'
import { card } from '@/app/components/styles'
import { InviteButtons, LeaveButton } from '@/app/dashboard/shared/invite-actions'
import { getSessionUser } from '@/lib/auth'
import { getPortfolioCards } from '@/lib/data'
import { formatDate } from '@/lib/format'
import { getSharedWithMe, timeLeft, type MemberRole } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Shared with me — FolioQ' }

function RoleChip({ role }: { role: MemberRole }) {
  const Icon = role === 'editor' ? Pencil : Eye
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-600/30 bg-mint-600/[.08] px-3 py-1 text-xs font-medium text-mint-800 dark:border-mint-400/30 dark:bg-mint-400/[.1] dark:text-mint-200">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {role === 'editor' ? 'Editor' : 'View only'}
    </span>
  )
}

export default async function SharedPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard/shared')

  const supabase = await createClient()
  const shared = await getSharedWithMe(supabase)
  const invites = (shared ?? []).filter((s) => s.status === 'pending')
  const accepted = (shared ?? []).filter((s) => s.status === 'accepted')
  const cards = await getPortfolioCards(supabase, { ids: accepted.map((s) => s.portfolioId) })
  const cardFor = new Map(cards.map((c) => [c.portfolio.id, c]))

  return (
    <>
      <LiveSync
        name={`shared:${user.id}`}
        watch={[{ table: 'portfolio_members', filter: `user_id=eq.${user.id}` }, { table: 'holdings' }]}
      />

      <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">Shared with me</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
        Portfolios other people have invited you into. To be invited, give them your share ID from{' '}
        <Link href="/account" className="font-medium text-mint-700 underline-offset-4 hover:underline dark:text-mint-300">
          Account
        </Link>
        .
      </p>

      {shared === null ? (
        <p className="mt-8 max-w-2xl rounded-2xl bg-zinc-100 px-5 py-4 text-sm leading-6 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Sharing between accounts isn&apos;t set up yet. Run{' '}
          <code className="font-mono text-xs">supabase/sharing.sql</code> in the Supabase SQL
          editor, then reload this page.
        </p>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-2xl text-black dark:text-zinc-50">Invitations</h2>
            {invites.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                No invitations waiting. An invite stays open for 7 days.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {invites.map((invite) => (
                  <li key={invite.memberId} className={`${card} border-amber-deep/40 p-6`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {invite.ownerName} invited you to
                        </p>
                        <h3 className="mt-0.5 text-xl leading-snug text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">
                          {invite.portfolioName}
                        </h3>
                      </div>
                      <RoleChip role={invite.role} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {invite.role === 'editor'
                        ? 'You would be able to see it and change its holdings and theses.'
                        : 'You would be able to see its holdings, values, and theses, and change nothing.'}{' '}
                      Sent {formatDate(invite.invitedAt)}; {timeLeft(invite.expiresAt)} left to answer.
                    </p>
                    <div className="mt-5">
                      <InviteButtons
                        memberId={invite.memberId}
                        portfolioId={invite.portfolioId}
                        portfolioName={invite.portfolioName}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12">
            <h2 className="text-2xl text-black dark:text-zinc-50">Portfolios you can open</h2>
            {accepted.length > 0 && (
              <RateNote className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400" />
            )}
            {accepted.length === 0 ? (
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Nothing yet. When you accept an invitation, the portfolio appears here and stays
                until you remove it or its owner takes your access away.
              </p>
            ) : (
              <ul className="mt-4 grid gap-5 md:grid-cols-2">
                {accepted.map((item) => {
                  const numbers = cardFor.get(item.portfolioId)
                  return (
                    <li key={item.memberId} className={`${card} flex flex-col p-6`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-2xl leading-tight text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">
                            <Link
                              href={`/dashboard/${item.portfolioId}`}
                              className="rounded underline-offset-4 hover:underline"
                            >
                              {item.portfolioName}
                            </Link>
                          </h3>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Shared by {item.ownerName}
                          </p>
                        </div>
                        <RoleChip role={item.role} />
                      </div>

                      {numbers && (
                        <div className="mt-5 flex items-end justify-between gap-4">
                          <div>
                            <p className="text-3xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
                              <Amount value={numbers.totals.marketValue} />
                            </p>
                            <p className="mt-1 text-sm tabular-nums">
                              <Delta amount={numbers.totals.dayChange} ratio={numbers.totals.dayChangePct} />
                              <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">today</span>
                            </p>
                          </div>
                          <Sparkline points={numbers.history} />
                        </div>
                      )}

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                        <Link
                          href={`/dashboard/${item.portfolioId}`}
                          className="text-sm font-medium text-mint-700 underline-offset-4 hover:underline dark:text-mint-300"
                        >
                          Open portfolio
                        </Link>
                        <LeaveButton
                          memberId={item.memberId}
                          portfolioName={item.portfolioName}
                          ownerName={item.ownerName}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
