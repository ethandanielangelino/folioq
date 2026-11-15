'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ChevronDown, MessageSquarePlus, ShieldCheck, Target, Trash2 } from 'lucide-react'
import BinButton from '@/app/components/bin-button'
import {
  WAIT_LIMIT_MS,
  dismissAnswer,
  giveUpAnswer,
  isBusy,
  resumeAnswer,
  startAnswer,
  useAnswer,
  watchAnswer,
} from '@/app/components/app/answer-store'
import { ASK_EVENT } from '@/app/components/portfolio/ask'
import { card, errorText, field } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { clearMessages, deleteChat } from '@/app/dashboard/actions'
import AssistantMessage from '@/app/dashboard/[id]/assistant-message'
import { TRUSTED_PUBLISHERS } from '@/lib/assistant-format'
import { readOutcome } from '@/lib/chat-actions'
import { ChatActionProvider, type ChatActionContext } from '@/app/dashboard/[id]/chat-action'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/** One saved chat: its first question as a title, when it was last used, and what was said. */
export interface ChatView {
  id: string
  title: string
  /** When it was last used, as an ISO timestamp. */
  at: string
  messages: ChatMessage[]
}

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
const noSubscription = () => () => {}

/**
 * The day a chat was last used, in the reader's own time zone. The server
 * can't know that zone, so it renders the UTC day and the browser corrects it.
 */
function LocalDay({ iso }: { iso: string }) {
  const day = useSyncExternalStore(
    noSubscription,
    () => new Date(iso).toLocaleDateString('en-US', DAY),
    () => new Date(iso).toLocaleDateString('en-US', { ...DAY, timeZone: 'UTC' })
  )
  return <>{day}</>
}

const starters = [
  'Review this portfolio the way a stakeholder would.',
  'Where am I most concentrated?',
  'Which thesis is weakest against the numbers?',
  'I want to add a holding.',
]

/** With nothing held yet there is nothing to review, but a first holding can be added from here. */
const firstStarters = ['I want to add a holding.', 'I want to add money to this portfolio.']

/** A line noting what became of a change card: shown in its card, not as a message of its own. */
const isOutcome = (m: ChatMessage) => m.role === 'assistant' && readOutcome(m.content) !== null

const publishers = TRUSTED_PUBLISHERS.map((p) => p.name)

/** How often a page checks for an answer that is being finished out of its sight. */
const CHECK_EVERY_MS = 3000

export default function AssistantPanel({
  portfolioId,
  portfolioName,
  chats,
  multiChat,
  hasHoldings,
  purpose,
  purposeAction,
  actionContext,
}: {
  portfolioId: string
  /** For the notice shown on other pages while an answer is being written. */
  portfolioName: string
  /** Saved chats, most recently used first. */
  chats: ChatView[]
  /** False until supabase/chats.sql has been run; there is then one conversation. */
  multiChat: boolean
  hasHoldings: boolean
  /** What the owner says this portfolio is for, or null when they haven't said. */
  purpose: string | null
  /** The control that opens the form for writing the purpose. */
  purposeAction: React.ReactNode
  /** What a change card in the chat needs: today, the cash, the holdings it can buy or sell. */
  actionContext: Omit<ChatActionContext, 'chatId' | 'outcomes'>
}) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  // Which chat is open. Null means "the most recent one"; a new chat gets a
  // fresh id here and only reaches the database with its first question.
  const [activeId, setActiveId] = useState<string | null>(null)
  // The answer in progress lives outside this panel, so it keeps arriving
  // while the person is on another page and is here when they come back.
  const answer = useAnswer(portfolioId)
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [, startRefresh] = useTransition()
  const [clearing, startClear] = useTransition()
  const [handedBack, setHandedBack] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const uid = useId()

  /** How many saved questions and answers a chat has (a change card's outcome isn't one). */
  const countIn = useCallback(
    (chatId: string | null) =>
      (multiChat ? chats.find((chat) => chat.id === chatId) : chats[0])?.messages.filter((m) => !isOutcome(m)).length ?? 0,
    [chats, multiChat]
  )

  // Coming back to a chat with an answer still on its way opens that chat.
  const answerChat = multiChat && answer && answer.status !== 'failed' ? answer.chatId : null
  const currentId = activeId ?? answerChat ?? chats[0]?.id ?? null
  const current = chats.find((chat) => chat.id === currentId) ?? null
  const saved = current?.messages ?? []
  const messages = saved.filter((m) => !isOutcome(m))
  // What became of each change card in this chat.
  const outcomes = new Map(
    saved.flatMap((m) => {
      const outcome = m.role === 'assistant' ? readOutcome(m.content) : null
      return outcome ? [[outcome.id, outcome] as const] : []
    })
  )
  // A chat that has been started here but has nothing saved in it yet.
  const unsaved = multiChat && currentId !== null && current === null

  // The saved conversation now holds the answer, so the live copy can go.
  const landed =
    answer !== null && answer.status !== 'failed' && countIn(answer.chatId) > answer.baseline
  const status = answer?.status ?? null
  const startedAt = answer?.startedAt ?? 0
  const onScreen = answer?.onScreen ?? false

  // An answer that broke off: say so, and hand the question back so it isn't
  // lost. Done once it is seen, so one that failed elsewhere waits for that.
  if (status === 'failed' && onScreen && handedBack !== startedAt && answer) {
    setHandedBack(startedAt)
    setError(answer.error)
    setDraft(answer.question)
  }
  useEffect(() => {
    if (status === 'failed' && onScreen) dismissAnswer(portfolioId)
  }, [status, onScreen, portfolioId])

  // After a reload, pick up an answer this tab was waiting for.
  useEffect(() => {
    resumeAnswer(portfolioId)
  }, [portfolioId])

  // Tell the rest of the app whether this panel is on screen, so the notice
  // in the corner only appears when it isn't.
  useEffect(() => {
    const element = sectionRef.current
    if (!element) return
    let unwatch: (() => void) | null = null
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !unwatch) unwatch = watchAnswer(portfolioId)
      else if (!entry.isIntersecting && unwatch) {
        unwatch()
        unwatch = null
      }
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      unwatch?.()
    }
  }, [portfolioId])

  // A finished answer (or one finished out of sight after a reload): load
  // the saved conversation, which replaces the live copy in one step.
  useEffect(() => {
    if (status !== 'done' && status !== 'waiting') return
    if (landed) {
      if (onScreen) dismissAnswer(portfolioId)
      return
    }
    const refresh = () => startRefresh(() => router.refresh())
    refresh()
    const timer = setInterval(() => {
      if (Date.now() - startedAt < WAIT_LIMIT_MS) refresh()
      else if (status === 'waiting') giveUpAnswer(portfolioId, 'The answer didn’t arrive. Ask again.')
      else dismissAnswer(portfolioId)
    }, CHECK_EVERY_MS)
    return () => clearInterval(timer)
  }, [status, landed, onScreen, startedAt, portfolioId, router])

  // Keep the newest text in view inside the scrolling list.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, answer?.text, currentId])

  const ask = useCallback(
    (input: string, inChat?: string) => {
      const question = input.trim()
      if (!question) return

      // With several chats, every question belongs to one: the open chat, or
      // a new one if none exists yet.
      const chatId = multiChat ? (inChat ?? currentId ?? crypto.randomUUID()) : null
      const started = startAnswer({
        portfolioId,
        portfolioName,
        chatId,
        question,
        baseline: countIn(chatId),
      })
      if (!started) return // still answering the last one
      if (multiChat && chatId !== currentId) setActiveId(chatId)
      setError('')
      setDraft('')
      setConfirmingDelete(false)
    },
    [portfolioId, portfolioName, multiChat, currentId, countIn]
  )

  // Questions sent from elsewhere ("Challenge it" on a thesis, the box on the
  // home page) each start a chat of their own.
  useEffect(() => {
    function onAsk(event: Event) {
      const question = (event as CustomEvent<{ question: string }>).detail.question
      void ask(question, multiChat ? crypto.randomUUID() : undefined)
    }
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [ask, multiChat])

  function clear() {
    setError('')
    startClear(async () => {
      const result = await clearMessages(portfolioId)
      if (!result.ok) setError(result.error)
      else toast('Conversation cleared')
    })
  }

  function newChat() {
    setActiveId(crypto.randomUUID())
    setError('')
    setDraft('')
    setConfirmingDelete(false)
    inputRef.current?.focus()
  }

  function openChat(id: string) {
    setActiveId(id)
    setError('')
    setConfirmingDelete(false)
  }

  function removeChat() {
    if (!current) return
    setError('')
    startClear(async () => {
      const result = await deleteChat(portfolioId, current.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setConfirmingDelete(false)
      setActiveId(null) // back to the most recent of what is left
      toast('Chat deleted')
    })
  }

  // Until the saved answer is showing, another question waits.
  const answering = isBusy(answer) || (status === 'done' && !landed)
  // An answer in progress is shown only in the chat it belongs to.
  const liveHere =
    answer && answering && answer.chatId === (multiChat ? currentId : null) ? answer : null
  const empty = messages.length === 0 && !liveHere

  return (
    <section ref={sectionRef} className={`${card} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl text-black dark:text-zinc-50">
            Ask about this portfolio
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            An AI assistant that reads the holdings and theses on this page and questions your
            reasoning. {multiChat ? 'Your chats are saved, and only you can see them.' : 'Only you can see this conversation.'}
          </p>
        </div>
        {!multiChat && messages.length > 0 && (
          <BinButton
            label={clearing ? 'Clearing…' : 'Clear conversation'}
            onClick={clear}
            disabled={clearing || answering}
          />
        )}
      </div>

      {!multiChat && (
        <p className="mt-3 rounded-2xl bg-zinc-100 px-4 py-3 text-xs leading-5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          There is one conversation per portfolio for now. To keep several chats and come back
          to them, run <code className="font-mono">supabase/chats.sql</code> in the Supabase SQL
          editor and reload this page.
        </p>
      )}

      {purpose ? (
        <p className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <Target className="mt-1 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
          <span className="min-w-0">
            Answers are tailored to this portfolio&apos;s purpose:{' '}
            <span className="text-black dark:text-zinc-100">&ldquo;{purpose}&rdquo;</span>
          </span>
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-amber-deep/40 bg-amber-tint/25 px-4 py-3.5 dark:bg-amber-deep/10">
          <p className="min-w-0 flex-1 basis-72 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-black dark:text-zinc-50">
              Tell the assistant what this portfolio is for.
            </span>{' '}
            Whose money it is, what it is meant to do, and any limits you work within. Without
            that, its answers stay general.
          </p>
          {purposeAction}
        </div>
      )}

      <details className="group mt-5 rounded-2xl border border-black/[.08] bg-zinc-50 dark:border-white/[.1] dark:bg-white/[.03]">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="h-5 w-5 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-black dark:text-zinc-50">Not financial advice.</span>{' '}
            It explains and questions. It never tells you to buy, sell, or hold.
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="hidden sm:inline">How it works</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="grid gap-x-10 gap-y-5 border-t border-black/[.07] px-4 py-4 text-sm leading-6 text-zinc-600 md:grid-cols-2 dark:border-white/[.1] dark:text-zinc-400">
          <div>
            <h3 className="font-medium text-black dark:text-zinc-50">What it will not do</h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-mint-500">
              <li>Recommend buying, selling, holding, or resizing a position.</li>
              <li>Predict prices or returns, or rank holdings against each other.</li>
              <li>Say whether an investment suits you or the people you answer to.</li>
            </ul>
            <p className="mt-3">
              FolioQ is not a licensed financial adviser, and nothing the assistant writes is
              investment, legal, or tax advice. Every decision is yours. Speak to a qualified
              adviser before acting on anything that matters.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-black dark:text-zinc-50">Where its information comes from</h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-mint-500">
              <li>The holdings, theses, and description you entered for this portfolio.</li>
              <li>Prices and company details from Finnhub.</li>
              <li>
                Headlines from the past week about your largest holdings, only when published by:{' '}
                {publishers.join(', ')}.
              </li>
            </ul>
            <p className="mt-3">
              When an answer relies on prices or a headline, the sources are numbered and listed
              under it. It is told not to state facts from memory. It is still a language model
              and can be wrong, so check anything you intend to rely on.
            </p>
            <h3 className="mt-4 font-medium text-black dark:text-zinc-50">Recording changes</h3>
            <p className="mt-1.5">
              Tell it what you did, such as a holding to add, a purchase, a sale, or money in or out, and it sets
              the change up as a form in the chat, filled in from what you said. You answer whatever is missing
              and confirm. Nothing is saved until you do, and it never suggests a change you didn&apos;t ask for.
            </p>
          </div>
        </div>
      </details>

      <div className={multiChat ? 'mt-5 grid items-start gap-x-6 gap-y-4 lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}>
        {multiChat && (
          <nav aria-label="Your chats" className="min-w-0">
            <button
              type="button"
              onClick={newChat}
              disabled={answering || unsaved || (chats.length === 0 && activeId === null)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-black/[.12] bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:border-mint-600 hover:text-mint-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.15] dark:bg-transparent dark:text-zinc-100 dark:hover:border-mint-400 dark:hover:text-mint-200"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              New chat
            </button>

            {/* Small screens: a menu. Wide screens: the list. */}
            {(chats.length > 0 || unsaved) && (
              <div className="mt-3 lg:hidden">
                <label htmlFor={`${uid}-chats`} className="sr-only">
                  Open a chat
                </label>
                <select
                  id={`${uid}-chats`}
                  value={currentId ?? ''}
                  disabled={answering}
                  onChange={(event) => openChat(event.target.value)}
                  className="h-10 w-full rounded-full border border-black/[.1] bg-white px-4 text-sm text-black dark:border-white/[.15] dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {unsaved && currentId && <option value={currentId}>New chat</option>}
                  {chats.map((chat) => (
                    <option key={chat.id} value={chat.id}>
                      {chat.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <ul className="mt-3 hidden max-h-[30rem] flex-col gap-1 overflow-y-auto lg:flex">
              {unsaved && (
                <li>
                  <span
                    aria-current="true"
                    className="block rounded-xl bg-mint-600/[.12] px-3 py-2.5 text-sm font-medium text-mint-800 dark:bg-mint-400/[.14] dark:text-mint-200"
                  >
                    New chat
                  </span>
                </li>
              )}
              {chats.map((chat) => {
                const open = chat.id === currentId
                return (
                  <li key={chat.id} className="rise-in">
                    <button
                      type="button"
                      onClick={() => openChat(chat.id)}
                      disabled={answering}
                      aria-current={open ? 'true' : undefined}
                      className={`block w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-200 disabled:cursor-not-allowed ${
                        open
                          ? 'bg-mint-600/[.12] dark:bg-mint-400/[.14]'
                          : 'hover:bg-black/[.04] dark:hover:bg-white/[.06]'
                      }`}
                    >
                      <span
                        className={`line-clamp-2 text-sm leading-5 ${
                          open
                            ? 'font-medium text-mint-800 dark:text-mint-200'
                            : 'text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {chat.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                        <LocalDay iso={chat.at} />,{' '}
                        {(() => {
                          const asked = chat.messages.filter((m) => m.role === 'user').length
                          return asked === 1 ? '1 question' : `${asked} questions`
                        })()}
                      </span>
                    </button>
                  </li>
                )
              })}
              {chats.length === 0 && !unsaved && (
                <li className="px-3 py-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  No chats yet. Ask a question and it is saved here.
                </li>
              )}
            </ul>
          </nav>
        )}

        <div className="min-w-0">
          {multiChat && current && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-zinc-50">
                {current.title}
              </p>
              {confirmingDelete ? (
                <span className="rise-in flex items-center gap-2 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Delete this chat?</span>
                  <button
                    type="button"
                    onClick={removeChat}
                    disabled={clearing}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {clearing ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <BinButton
                  label="Delete chat"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={answering}
                />
              )}
            </div>
          )}

      {empty ? (
        <div key={`empty-${currentId ?? 'one'}`} className={`rise-in ${multiChat ? '' : 'mt-5'}`}>
          {!hasHoldings && (
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Nothing is held yet. Tell the assistant what this portfolio holds and it sets it up for you to confirm.
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {(hasHoldings ? starters : firstStarters).map((starter) => (
              <li key={starter}>
                <button
                  type="button"
                  onClick={() => void ask(starter)}
                  className="rounded-full border border-black/[.1] px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:border-mint-500 hover:bg-mint-400/10 dark:border-white/[.15] dark:text-zinc-300 dark:hover:border-mint-400"
                >
                  {starter}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        // `relative` keeps visually-hidden labels inside this scroller.
        <div
          key={`log-${currentId ?? 'one'}`}
          role="log"
          aria-label="Conversation"
          aria-busy={answering}
          className={`rise-in relative flex max-h-[min(44rem,80vh)] flex-col gap-4 overflow-y-auto rounded-2xl bg-zinc-50 p-4 dark:bg-white/[.03] ${multiChat ? '' : 'mt-5'}`}
        >
          <ChatActionProvider value={{ ...actionContext, chatId: multiChat ? currentId : null, outcomes }}>
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.role === 'assistant' ? <AssistantMessage content={m.content} /> : m.content}
              </Bubble>
            ))}
          </ChatActionProvider>
          {liveHere && (
            <>
              <Bubble role="user" arriving>
                {liveHere.question}
              </Bubble>
              {liveHere.text ? (
                <Bubble role="assistant" streaming={liveHere.status === 'writing'} arriving>
                  <AssistantMessage content={liveHere.text} live />
                </Bubble>
              ) : (
                <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span
                    aria-hidden="true"
                    className="animate-pulse-dot h-2 w-2 rounded-full bg-mint-500"
                  />
                  {liveHere.status === 'waiting'
                    ? 'Still writing the answer. It will appear here when it is done.'
                    : 'Reading the portfolio…'}
                </p>
              )}
            </>
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <p role="alert" className={`mt-4 ${errorText}`}>
          {error}
        </p>
      )}

      <form
        className="relative mt-5"
        onSubmit={(event) => {
          event.preventDefault()
          void ask(draft)
        }}
      >
        <label htmlFor={`${uid}-question`} className="sr-only">
          Your question
        </label>
        <textarea
          id={`${uid}-question`}
          ref={inputRef}
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void ask(draft)
            }
          }}
          placeholder="Ask about the holdings or a thesis, or say what to record (“I bought 0.5 BTC today”)"
          className={`${field} block resize-none pr-14 disabled:opacity-50`}
        />
        <button
          type="submit"
          disabled={answering || !draft.trim()}
          aria-label={answering ? 'Answering' : 'Ask'}
          className="absolute inset-y-0 right-2.5 my-auto flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-[background-color,opacity,transform] duration-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Press Enter to ask, Shift and Enter for a new line. You can leave this page while it
        answers. Answers are generated by AI, can be wrong, and are not financial advice.
        {multiChat && ' Within a chat the assistant remembers what was said; each chat starts fresh.'}
      </p>
        </div>
      </div>
    </section>
  )
}

function Bubble({
  role,
  streaming = false,
  arriving = false,
  children,
}: {
  role: 'user' | 'assistant'
  streaming?: boolean
  /** Just sent or being written: it rises into place. */
  arriving?: boolean
  children: React.ReactNode
}) {
  const mine = role === 'user'
  return (
    <div className={`${mine ? 'flex justify-end' : 'flex justify-start'} ${arriving ? 'rise-in' : ''}`}>
      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
          mine
            ? 'max-w-[85%] bg-black whitespace-pre-line text-white dark:bg-white dark:text-black'
            : 'w-full max-w-[min(100%,42rem)] border border-black/[.08] bg-white text-zinc-800 dark:border-white/[.1] dark:bg-zinc-900 dark:text-zinc-200'
        }`}
      >
        <span className="sr-only">{mine ? 'You: ' : 'Assistant: '}</span>
        {children}
        {streaming && (
          <span
            aria-hidden="true"
            className="animate-pulse-dot mt-2 block h-1.5 w-6 rounded-full bg-mint-500"
          />
        )}
      </div>
    </div>
  )
}
