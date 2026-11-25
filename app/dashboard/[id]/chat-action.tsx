'use client'

import { createContext, useContext, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowUpFromLine, Check, CircleSlash, Sparkles, Trash2 } from 'lucide-react'
import { errorText, outlineButton } from '@/app/components/styles'
import { deleteHolding, recordChatOutcome } from '@/app/dashboard/actions'
import { AddHoldingForm } from '@/app/dashboard/[id]/add-holding-dialog'
import { CashForm } from '@/app/dashboard/[id]/cash-dialog'
import type { CashLine } from '@/app/dashboard/[id]/cash-choice'
import { TradeForm, type TradableHolding } from '@/app/dashboard/[id]/trade-dialog'
import { METALS, kindOf } from '@/lib/assets'
import { actionTitle, type ChatAction, type Outcome } from '@/lib/chat-actions'

/** What a change card in the chat needs from the portfolio page. */
export interface ChatActionContext {
  portfolioId: string
  /** The chat the card is in; null when there is one conversation per portfolio. */
  chatId: string | null
  today: string
  assetTypes: boolean
  cashLines: CashLine[]
  holdings: TradableHolding[]
  /** What became of each change set up in this chat, by its id. */
  outcomes: Map<string, Outcome>
}

const Context = createContext<ChatActionContext | null>(null)
export const ChatActionProvider = Context.Provider

const nameOf = (ticker: string, holdings: TradableHolding[]) => {
  const held = holdings.find((h) => h.ticker === ticker)
  return held && kindOf(held.assetClass) === 'metal' ? (METALS[ticker] ?? ticker) : ticker
}

/**
 * A change the assistant set up, as a card in its answer: the same form as
 * the matching dialog, filled in from what the owner said, asking for the
 * rest. Nothing is saved until the owner presses Confirm; Cancel saves
 * nothing. Afterwards the card shows what was recorded.
 */
export default function ChatActionCard({ action }: { action: ChatAction }) {
  const context = useContext(Context)
  const router = useRouter()
  const [local, setLocal] = useState<Outcome | null>(null)
  const [noteError, setNoteError] = useState('')
  const [, startRefresh] = useTransition()

  if (!context) return null
  const outcome = local ?? context.outcomes.get(action.id) ?? null
  const title = action.type === 'buy' || action.type === 'sell' || action.type === 'remove'
    ? actionTitle({ ...action, ticker: nameOf(action.ticker, context.holdings) })
    : actionTitle(action)

  /** Notes in the chat what became of this card, so it stays settled after a reload. */
  async function settle(status: Outcome['status'], summary: string) {
    setLocal({ id: action.id, status, summary })
    let result = await recordChatOutcome(context!.portfolioId, context!.chatId, action.id, status, summary)
    if (!result.ok) result = await recordChatOutcome(context!.portfolioId, context!.chatId, action.id, status, summary)
    if (!result.ok) setNoteError('Saved, but the chat could not note it. Don’t confirm this card again after a reload.')
    startRefresh(() => router.refresh())
  }

  const Icon =
    action.type === 'remove'
      ? Trash2
      : action.type === 'cash'
        ? action.direction === 'in'
          ? ArrowDownToLine
          : ArrowUpFromLine
        : Sparkles

  if (outcome) {
    return (
      <div
        data-testid="chat-action"
        data-status={outcome.status}
        className="mt-3 flex items-start gap-2.5 rounded-2xl border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm dark:border-white/[.1] dark:bg-white/[.03]"
      >
        {outcome.status === 'done' ? (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-400 text-black">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <CircleSlash className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-black dark:text-zinc-50">
            {outcome.status === 'done' ? `${title}: recorded` : `${title}: cancelled`}
          </p>
          <p className="mt-0.5 leading-6 text-zinc-600 dark:text-zinc-400">
            {outcome.status === 'done' ? outcome.summary : 'Nothing was changed.'}
          </p>
          {noteError && <p className={`mt-1 ${errorText}`}>{noteError}</p>}
        </div>
      </div>
    )
  }

  const done = (d: { record: string }) => void settle('done', d.record)
  const cancel = () => void settle('cancelled', '')
  const common = { portfolioId: context.portfolioId, today: context.today, cashLines: context.cashLines, onDone: done, onCancel: cancel, mode: 'chat' as const }

  let body: React.ReactNode
  if (action.type === 'add') {
    const initial = {
      kind: action.kind,
      ticker: action.ticker,
      how: action.how,
      quantity: action.quantity,
      spend: action.spend,
      cost: action.cost,
      date: action.date,
      payFrom: action.payFrom,
    }
    body = <AddHoldingForm {...common} assetTypes={context.assetTypes} initial={initial} />
  } else if (action.type === 'cash') {
    body = (
      <CashForm
        {...common}
        direction={action.direction}
        initial={{ currency: action.currency, amount: action.amount, date: action.date, purpose: action.purpose }}
      />
    )
  } else {
    const holding = context.holdings.find((h) => h.id === action.holdingId)
    if (!holding) {
      body = (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {action.ticker} is no longer in this portfolio, so this can&apos;t be recorded.
          </p>
          <button type="button" onClick={cancel} className={`${outlineButton} self-start`}>
            Dismiss
          </button>
        </div>
      )
    } else if (action.type === 'remove') {
      body = <RemoveConfirm portfolioId={context.portfolioId} holding={holding} onDone={done} onCancel={cancel} />
    } else {
      body = (
        <TradeForm
          {...common}
          side={action.type}
          holding={holding}
          initial={{
            quantity: action.quantity,
            all: action.type === 'sell' ? action.all : undefined,
            spend: action.type === 'buy' ? action.spend : undefined,
            date: action.date,
            payFrom: action.type === 'buy' ? action.payFrom : undefined,
            into: action.type === 'sell' ? action.into : undefined,
          }}
        />
      )
    }
  }

  return (
    <section
      data-testid="chat-action"
      data-status="open"
      aria-label={title}
      className="rise-in mt-3 rounded-2xl border border-mint-600/25 bg-white p-3 sm:p-5 dark:border-mint-400/25 dark:bg-zinc-900"
    >
      <header className="mb-4 flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${action.type === 'remove' ? 'text-red-600 dark:text-red-400' : 'text-mint-700 dark:text-mint-300'}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-medium text-black dark:text-zinc-50">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Filled in from your message. Answer what&apos;s left, check it, and confirm. Nothing is saved until you do.
          </p>
        </div>
      </header>
      {body}
    </section>
  )
}

/** Removing a holding entered by mistake: said plainly, confirmed with a red button. */
function RemoveConfirm({
  portfolioId,
  holding,
  onDone,
  onCancel,
}: {
  portfolioId: string
  holding: TradableHolding
  onDone: (d: { record: string }) => void
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const name = kindOf(holding.assetClass) === 'metal' ? (METALS[holding.ticker] ?? holding.ticker) : holding.ticker
  return (
    <div className="flex flex-col gap-4">
      <p data-testid="action-summary" className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        Remove {name} from this portfolio, with its thesis. This deletes it without recording a sale, so use it
        only for a holding entered by mistake. If you sold it, ask to record a sale instead.
      </p>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={pending} className={outlineButton}>
          Keep it
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteHolding(portfolioId, holding.id)
              if (!result.ok) return setError(result.error)
              startTransition(() => onDone({ record: `Removed ${name} from the portfolio (not recorded as a sale).` }))
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Removing…' : `Remove ${name}`}
        </button>
      </div>
    </div>
  )
}
