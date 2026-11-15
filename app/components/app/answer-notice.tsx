'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertCircle, Check, X } from 'lucide-react'
import { dismissAnswer, useAnswers, type Answer } from '@/app/components/app/answer-store'
import { goToTab } from '@/app/components/portfolio/tabs'

/**
 * A small card in the corner while the assistant answers a question asked on
 * a page the person has since left (or scrolled away from): it says the
 * answer is still being written, then that it is ready, with a way back to it.
 */
export default function AnswerNotice() {
  const answers = useAnswers().filter((a) => !a.onScreen)
  const pathname = usePathname()

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      {answers.map((answer) => (
        <Notice key={answer.startedAt} answer={answer} here={pathname === `/dashboard/${answer.portfolioId}`} />
      ))}
    </div>
  )
}

function Notice({ answer, here }: { answer: Answer; here: boolean }) {
  const writing = answer.status === 'writing' || answer.status === 'waiting'
  const failed = answer.status === 'failed'

  return (
    <div className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-black py-3 pr-2 pl-4 text-sm text-white shadow-lg shadow-black/20 dark:bg-white dark:text-black">
      {writing ? (
        <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="animate-pulse-dot h-2.5 w-2.5 rounded-full bg-mint-400" />
        </span>
      ) : failed ? (
        <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-300 dark:text-amber-600" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-400 text-black">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )}

      <p className="min-w-0 flex-1 leading-5">
        {writing ? (
          <>Writing your answer about {answer.portfolioName}…</>
        ) : failed ? (
          <>The answer about {answer.portfolioName} didn&apos;t finish.</>
        ) : (
          <>Your answer about {answer.portfolioName} is ready.</>
        )}
      </p>

      <Link
        href={`/dashboard/${answer.portfolioId}#assistant`}
        onClick={(event) => {
          // Already on that portfolio: switch to its Assistant tab instead of reloading.
          if (!here) return
          event.preventDefault()
          goToTab('assistant')
          requestAnimationFrame(() =>
            document.getElementById('panel-assistant')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          )
        }}
        className="shrink-0 rounded-full px-3 py-1.5 font-medium text-mint-300 transition-colors hover:bg-white/10 dark:text-mint-700 dark:hover:bg-black/[.06]"
      >
        Open
      </Link>
      {!writing && (
        <button
          type="button"
          onClick={() => dismissAnswer(answer.portfolioId)}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-500 dark:hover:bg-black/[.06] dark:hover:text-black"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
