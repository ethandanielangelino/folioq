import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import { ChevronLeft, Eye, Pencil } from 'lucide-react'
import { ChallengeButton } from '@/app/components/portfolio/ask'
import AskOnArrival from '@/app/components/portfolio/ask-on-arrival'
import { LiveRefresh } from '@/app/components/portfolio/live'
import LiveSync from '@/app/components/portfolio/live-sync'
import PortfolioOverview from '@/app/components/portfolio/portfolio-overview'
import PortfolioTabs from '@/app/components/portfolio/tabs'
import ThesisList from '@/app/components/portfolio/thesis-list'
import { outlineButton } from '@/app/components/styles'
import AssistantPanel from '@/app/dashboard/[id]/assistant-panel'
import DeletePortfolioButton from '@/app/dashboard/[id]/delete-portfolio-button'
import HoldingDialog from '@/app/dashboard/[id]/holding-dialog'
import ShareDialog from '@/app/dashboard/[id]/share-dialog'
import ThesisDialog from '@/app/dashboard/[id]/thesis-dialog'
import PortfolioFormDialog from '@/app/dashboard/portfolio-form-dialog'
import { getSessionUser } from '@/lib/auth'
import { LeaveButton } from '@/app/dashboard/shared/invite-actions'
import { getMessages, getOwnedPortfolioView, getPortfolioRole, savePrices } from '@/lib/data'
import { marketDate } from '@/lib/format'
import { APP_RESEARCH } from '@/lib/routes'
import { getPeople, getSharedWithMe, timeLeft } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string | string[]; ask?: string | string[] }>
}

const textLink =
  'rounded text-xs font-medium text-zinc-600 underline underline-offset-4 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'
const smallButton = `${outlineButton} px-4 py-2`
const purposePrompt =
  'inline-flex items-center gap-2 rounded-full border border-dashed border-mint-600/60 px-4 py-1.5 text-sm font-medium text-mint-800 transition-colors hover:bg-mint-600/[.08] dark:border-mint-400/60 dark:text-mint-200 dark:hover:bg-mint-400/[.1]'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return {}
  const supabase = await createClient()
  const { data } = await supabase.from('portfolios').select('name').eq('id', id).maybeSingle()
  return data?.name ? { title: `${data.name} — FolioQ` } : {}
}

export default async function PortfolioPage({ params, searchParams }: Props) {
  const { id } = await params
  const query = await searchParams
  const editPurpose = query.edit === 'purpose'
  const arrivingQuestion = (Array.isArray(query.ask) ? query.ask[0] : query.ask)?.trim().slice(0, 2000)

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/${id}`)}`)

  const supabase = await createClient()
  const view = await getOwnedPortfolioView(supabase, id)
  if (!view) notFound()

  const { portfolio, holdings } = view

  // Owner, editor, or viewer. Anything else can't see the row at all, but a
  // membership can end between the two queries, so that is checked too.
  const role = await getPortfolioRole(supabase, portfolio, user.id)
  if (!role) notFound()
  const isOwner = role === 'owner'
  const canEdit = isOwner || role === 'editor'

  // The assistant conversation and the list of who has access are the owner's.
  const [messages, people, sharedWithMe] = await Promise.all([
    isOwner ? getMessages(supabase, portfolio.id) : [],
    isOwner ? getPeople(supabase, portfolio.id) : null,
    isOwner ? null : getSharedWithMe(supabase),
  ])
  const membership = sharedWithMe?.find((s) => s.portfolioId === portfolio.id) ?? null
  const today = marketDate()

  // Keep today's prices on record so the chart builds history, without
  // slowing the page down.
  after(() => savePrices(view.quotes))

  const withThesis = holdings.filter((h) => h.thesis).length
  const hasPurpose = Boolean(portfolio.mandate?.trim())
  const editable = { id: portfolio.id, name: portfolio.name, mandate: portfolio.mandate }

  const holdingActions = !canEdit ? undefined : Object.fromEntries(
    holdings.map((h) => [
      h.id,
      <HoldingDialog
        key={h.id}
        portfolioId={portfolio.id}
        today={today}
        holding={{
          id: h.id,
          ticker: h.ticker,
          quantity: h.quantity,
          costBasis: h.costBasis,
          openedAt: h.openedAt,
        }}
        triggerLabel="Edit"
        triggerClassName={textLink}
      />,
    ])
  )

  const thesisActions = !canEdit ? undefined : Object.fromEntries(
    holdings.map((h) => [
      h.id,
      <div key={h.id} className="flex flex-wrap items-center gap-2">
        {isOwner && h.thesis && <ChallengeButton ticker={h.ticker} className={smallButton} />}
        <ThesisDialog
          portfolioId={portfolio.id}
          holdingId={h.id}
          ticker={h.ticker}
          current={
            h.thesis
              ? { claim: h.thesis.claim, assumptions: h.thesis.assumptions, risks: h.thesis.risks }
              : null
          }
          triggerClassName={smallButton}
        />
      </div>,
    ])
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Hear about changes made from another account as they happen. */}
      <LiveSync
        name={`portfolio:${portfolio.id}`}
        watch={[
          { table: 'holdings', filter: `portfolio_id=eq.${portfolio.id}` },
          { table: 'theses' },
          { table: 'portfolios', filter: `id=eq.${portfolio.id}` },
          { table: 'portfolio_members', filter: `portfolio_id=eq.${portfolio.id}` },
        ]}
      />

      <div>
        <Link
          href={isOwner ? '/dashboard/portfolios' : '/dashboard/shared'}
          className="-ml-1 inline-flex items-center gap-1 rounded text-sm text-zinc-500 underline-offset-4 hover:text-black hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {isOwner ? 'Portfolios' : 'Shared with me'}
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">
              {portfolio.name}
            </h1>
            {hasPurpose ? (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {portfolio.mandate}
              </p>
            ) : !isOwner ? null : (
              <div className="mt-3">
                <PortfolioFormDialog
                  portfolio={editable}
                  triggerLabel="Say what this portfolio is for"
                  triggerClassName={purposePrompt}
                  defaultOpen={editPurpose}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isOwner && (
              <>
                <PortfolioFormDialog
                  portfolio={editable}
                  triggerLabel="Edit"
                  triggerClassName={outlineButton}
                  defaultOpen={editPurpose && hasPurpose}
                />
                <ShareDialog
                  portfolioId={portfolio.id}
                  portfolioName={portfolio.name}
                  shareToken={portfolio.share_token ?? null}
                  linkAvailable={view.sharingAvailable}
                  people={
                    people?.map((person) => ({ ...person, left: timeLeft(person.expiresAt) })) ?? null
                  }
                />
              </>
            )}
            {canEdit && (
              <HoldingDialog portfolioId={portfolio.id} today={today} triggerLabel="Add a holding" />
            )}
          </div>
        </div>

        {!isOwner && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-mint-600/30 bg-mint-600/[.07] px-4 py-3 dark:border-mint-400/30 dark:bg-mint-400/[.08]">
            <p className="flex min-w-0 flex-1 basis-64 items-start gap-2.5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {canEdit ? (
                <Pencil className="mt-1 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
              ) : (
                <Eye className="mt-1 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
              )}
              <span>
                <span className="font-medium text-black dark:text-zinc-50">
                  Shared with you by {membership?.ownerName ?? 'its owner'}.
                </span>{' '}
                {canEdit
                  ? 'You’re an editor: you can add, change, and remove holdings and theses, and they see your changes straight away.'
                  : 'View only: you can read everything here but can’t change it.'}
              </span>
            </p>
            {membership && (
              <LeaveButton
                memberId={membership.memberId}
                portfolioName={portfolio.name}
                ownerName={membership.ownerName}
                className={`${outlineButton} bg-white px-4 py-2 dark:bg-transparent`}
              />
            )}
          </div>
        )}
      </div>

      {holdings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/[.12] bg-white px-6 py-16 text-center dark:border-white/[.145] dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            {canEdit ? 'Add the first holding' : 'Nothing is held yet'}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            {canEdit
              ? 'Enter a position with its ticker, share count, and average cost. Then write down why it’s held: the claim, what has to stay true, and what could go wrong.'
              : 'Holdings will appear here when the owner adds them.'}
          </p>
          {canEdit && (
            <div className="mt-7">
              <HoldingDialog portfolioId={portfolio.id} today={today} triggerLabel="Add a holding" />
            </div>
          )}
        </div>
      ) : (
        <PortfolioTabs
          label="Portfolio sections"
          tabs={[
            {
              id: 'overview',
              label: 'Overview',
              content: (
                <PortfolioOverview
                  view={view}
                  holdingActions={holdingActions}
                  thesisTab="theses"
                  totalsFooter={<LiveRefresh renderedAt={view.fetchedAt} />}
                  researchBase={APP_RESEARCH}
                />
              ),
            },
            {
              id: 'theses',
              label: 'Theses',
              badge: `${withThesis} of ${holdings.length}`,
              content: <ThesisList holdings={holdings} actions={thesisActions} />,
            },
            // The assistant and its conversation stay with the owner.
            ...(!isOwner ? [] : [{
              id: 'assistant',
              label: 'Assistant',
              badge: messages.length > 0 ? String(messages.length) : undefined,
              content: (
                <AssistantPanel
                  portfolioId={portfolio.id}
                  messages={messages.map((m) => ({
                    id: m.id,
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                  }))}
                  hasHoldings={holdings.length > 0}
                  purpose={hasPurpose ? portfolio.mandate : null}
                  purposeAction={
                    <PortfolioFormDialog
                      portfolio={editable}
                      triggerLabel="Say what it is for"
                      triggerClassName={`${outlineButton} bg-white px-4 py-2 dark:bg-transparent`}
                    />
                  }
                />
              ),
            }]),
          ]}
        />
      )}

      {isOwner && arrivingQuestion && holdings.length > 0 && (
        <AskOnArrival question={arrivingQuestion} />
      )}

      {isOwner && (
        <div className="flex justify-end pt-2">
          <DeletePortfolioButton
            portfolioId={portfolio.id}
            name={portfolio.name}
            holdingCount={holdings.length}
          />
        </div>
      )}
    </div>
  )
}
