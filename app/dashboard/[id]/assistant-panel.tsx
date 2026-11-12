'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ChevronDown, ShieldCheck, Target } from 'lucide-react'
import { ASK_EVENT } from '@/app/components/portfolio/ask'
import { card, errorText, field } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { clearMessages } from '@/app/dashboard/actions'
import AssistantMessage from '@/app/dashboard/[id]/assistant-message'
import { TRUSTED_PUBLISHERS } from '@/lib/assistant-format'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const starters = [
  'Review this portfolio the way a stakeholder would.',
  'Where am I most concentrated?',
  'Which thesis is weakest against the numbers?',
]

/** The route sends this as its last character when an answer broke off. */
const FAILED = '\u0000'
/** The route sends this before the finished answer, which replaces the draft shown so far. */
const FINAL = '\u0001'

/** What to show from the text received so far. */
function shown(received: string): string {
  const text = received.replace(FAILED, '')
  const at = text.lastIndexOf(FINAL)
  return at === -1 ? text : text.slice(at + 1)
}

const publishers = TRUSTED_PUBLISHERS.map((p) => p.name)

export default function AssistantPanel({
  portfolioId,
  messages,
  hasHoldings,
  purpose,
  purposeAction,
}: {
  portfolioId: string
  messages: ChatMessage[]
  hasHoldings: boolean
  /** What the owner says this portfolio is for, or null when they haven't said. */
  purpose: string | null
  /** The control that opens the form for writing the purpose. */
  purposeAction: React.ReactNode
}) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  // The exchange in progress: the question, and the answer as it streams in.
  const [live, setLive] = useState<{ question: string; answer: string } | null>(null)
  const [error, setError] = useState('')
  const [, startRefresh] = useTransition()
  const [clearing, startClear] = useTransition()
  const busy = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const uid = useId()

  // Keep the newest text in view inside the scrolling list.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, live?.answer])

  const ask = useCallback(
    async (input: string) => {
      const question = input.trim()
      if (!question || busy.current || !hasHoldings) return
      busy.current = true
      setError('')
      setDraft('')
      setLive({ question, answer: '' })

      function giveBack(message: string) {
        setError(message)
        setDraft(question) // hand the question back so it isn't lost
        setLive(null)
      }

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ portfolioId, question }),
        })

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          giveBack(body?.error ?? 'The assistant could not answer. Try again.')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let answer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          answer += decoder.decode(value, { stream: true })
          setLive({ question, answer: shown(answer) })
        }

        if (answer.includes(FAILED) || !shown(answer).trim()) {
          giveBack('The answer was cut off before it finished. Try again.')
          return
        }

        // Swap the streamed copy for the saved conversation in one step.
        startRefresh(() => {
          router.refresh()
          setLive(null)
        })
      } catch {
        giveBack('The connection dropped before the answer finished. Try again.')
      } finally {
        busy.current = false
      }
    },
    [hasHoldings, portfolioId, router]
  )

  // Questions sent from elsewhere on the page ("Challenge it" on a thesis).
  useEffect(() => {
    function onAsk(event: Event) {
      void ask((event as CustomEvent<{ question: string }>).detail.question)
    }
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [ask])

  function clear() {
    setError('')
    startClear(async () => {
      const result = await clearMessages(portfolioId)
      if (!result.ok) setError(result.error)
      else toast('Conversation cleared')
    })
  }

  const answering = live !== null
  const empty = messages.length === 0 && !answering

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl text-black dark:text-zinc-50">
            Ask about this portfolio
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            An AI assistant that reads the holdings and theses on this page and questions your
            reasoning. Only you can see this conversation.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={clearing || answering}
            className="rounded text-sm font-medium text-zinc-500 underline-offset-4 hover:text-black hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {clearing ? 'Clearing…' : 'Clear conversation'}
          </button>
        )}
      </div>

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
          </div>
        </div>
      </details>

      {empty ? (
        <div className="mt-5">
          {hasHoldings ? (
            <ul className="flex flex-wrap gap-2">
              {starters.map((starter) => (
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
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Add a holding first, so there is something to ask about.
            </p>
          )}
        </div>
      ) : (
        // `relative` keeps visually-hidden labels inside this scroller.
        <div
          role="log"
          aria-label="Conversation"
          aria-busy={answering}
          className="relative mt-5 flex max-h-[34rem] flex-col gap-4 overflow-y-auto rounded-2xl bg-zinc-50 p-4 dark:bg-white/[.03]"
        >
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role}>
              {m.role === 'assistant' ? <AssistantMessage content={m.content} /> : m.content}
            </Bubble>
          ))}
          {live && (
            <>
              <Bubble role="user">{live.question}</Bubble>
              {live.answer ? (
                <Bubble role="assistant" streaming>
                  <AssistantMessage content={live.answer} />
                </Bubble>
              ) : (
                <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span
                    aria-hidden="true"
                    className="animate-pulse-dot h-2 w-2 rounded-full bg-mint-500"
                  />
                  Reading the portfolio…
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
          disabled={!hasHoldings}
          placeholder="Ask a question about the holdings or a thesis"
          className={`${field} resize-none pr-14 disabled:opacity-50`}
        />
        <button
          type="submit"
          disabled={answering || !draft.trim() || !hasHoldings}
          aria-label={answering ? 'Answering' : 'Ask'}
          className="absolute right-2.5 bottom-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Press Enter to ask, Shift and Enter for a new line. Answers are generated by AI, can be
        wrong, and are not financial advice.
      </p>
    </section>
  )
}

function Bubble({
  role,
  streaming = false,
  children,
}: {
  role: 'user' | 'assistant'
  streaming?: boolean
  children: React.ReactNode
}) {
  const mine = role === 'user'
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
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
