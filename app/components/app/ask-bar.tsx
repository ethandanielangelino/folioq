'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp } from 'lucide-react'

const starters = [
  'Where is it most concentrated?',
  'Which thesis is thinnest?',
  'What will they ask me first?',
]

/**
 * The question box on the signed-in home page. Sending a question opens that
 * portfolio's assistant and asks it there, so the answer lands in the saved
 * conversation rather than in a throwaway box.
 */
export default function AskBar({
  portfolioId,
  portfolioName,
}: {
  portfolioId: string
  portfolioName: string
}) {
  const router = useRouter()
  const [question, setQuestion] = useState('')

  function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    router.push(`/dashboard/${portfolioId}?ask=${encodeURIComponent(trimmed)}#assistant`)
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          ask(question)
        }}
        className="relative"
      >
        <label htmlFor="home-ask" className="sr-only">
          Ask the assistant about {portfolioName}
        </label>
        <input
          id="home-ask"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          autoComplete="off"
          placeholder={`Ask about ${portfolioName}`}
          className="w-full rounded-full border border-white/15 bg-white/[.07] py-3.5 pr-14 pl-5 text-[0.95rem] text-white transition-[border-color,background-color] outline-none placeholder:text-zinc-400 focus-visible:border-mint-300 focus-visible:bg-white/[.1]"
        />
        <button
          type="submit"
          disabled={!question.trim()}
          aria-label="Ask"
          className="absolute top-1/2 right-1.5 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-mint-300 text-black transition-colors hover:bg-mint-200 disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {starters.map((starter) => (
          <li key={starter}>
            <button
              type="button"
              onClick={() => ask(starter)}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-zinc-200 transition-colors hover:border-mint-300/70 hover:bg-white/[.06]"
            >
              {starter}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
