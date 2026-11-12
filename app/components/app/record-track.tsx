import { Check, Minus } from 'lucide-react'

export interface RecordPart {
  label: string
  /** Shown beside the label, e.g. "2 of 3". */
  detail: string
  state: 'done' | 'partial' | 'todo'
}

const bar = {
  done: 'bg-mint-600 dark:bg-mint-400',
  partial: 'bg-amber-deep',
  todo: 'bg-black/[.09] dark:bg-white/[.12]',
} as const

const word = { done: 'done', partial: 'in progress', todo: 'not started' } as const

/**
 * How complete a portfolio's record is: one segment each for its holdings,
 * its theses, and its share link.
 */
export default function RecordTrack({ parts }: { parts: RecordPart[] }) {
  return (
    <ul
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}
    >
      {parts.map((part) => (
        <li key={part.label}>
          <span aria-hidden="true" className={`block h-1.5 rounded-full ${bar[part.state]}`} />
          <span className="mt-2 flex items-start gap-1.5 text-xs leading-4">
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                part.state === 'done'
                  ? 'bg-mint-600 text-white dark:bg-mint-400 dark:text-black'
                  : part.state === 'partial'
                    ? 'bg-amber-tint text-black'
                    : 'border border-zinc-400/70'
              }`}
            >
              {part.state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
              {part.state === 'partial' && <Minus className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            {/* Label over figure on narrow cards, side by side when there is room. */}
            <span className="min-w-0">
              <span className="block font-medium text-black sm:inline dark:text-zinc-50">
                {part.label}
              </span>
              <span className="text-zinc-500 tabular-nums sm:ml-1.5 dark:text-zinc-400">
                {part.detail}
              </span>
              <span className="sr-only"> ({word[part.state]})</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
