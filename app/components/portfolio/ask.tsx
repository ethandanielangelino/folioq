'use client'

import { MessageCircleQuestion } from 'lucide-react'
import { goToTab } from '@/app/components/portfolio/tabs'

/** Fired on window to hand the assistant a question from elsewhere on the page. */
export const ASK_EVENT = 'folioq:ask'

/** Opens the assistant tab and asks it this question. */
export function askAssistant(question: string, assistantTab = 'assistant') {
  goToTab(assistantTab)
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question } }))
}

/** "Challenge this thesis": sends the holding's thesis to the assistant for a critique. */
export function ChallengeButton({ ticker, className = '' }: { ticker: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        askAssistant(
          `Challenge my thesis for ${ticker}. Which assumption is weakest, and what would you want to see before trusting it?`
        )
      }
      aria-label={`Challenge the thesis for ${ticker}`}
      className={className}
    >
      <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
      Challenge it
    </button>
  )
}
