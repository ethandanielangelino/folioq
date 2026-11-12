'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { field, primaryButton } from '@/app/components/styles'

interface Match {
  symbol: string
  description: string
  type: string
}

/**
 * Search box that suggests tickers as you type. Arrow keys move through the
 * suggestions and Enter opens one; with nothing highlighted, Enter submits
 * the form and the page lists every match (so it also works without script).
 */
export default function SymbolSearch({
  initialQuery,
  basePath = '/research',
}: {
  initialQuery: string
  /** Where results open: the public research pages, or the ones inside the app. */
  basePath?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [matches, setMatches] = useState<Match[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(0)
  const uid = useId()
  const listId = `${uid}-suggestions`

  function onChange(value: string) {
    setQuery(value)
    setHighlighted(-1)
    if (timer.current) clearTimeout(timer.current)

    const q = value.trim()
    if (!q) {
      setMatches([])
      setOpen(false)
      return
    }
    // Wait for a pause in typing, and ignore answers that arrive out of order.
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current
      try {
        const res = await fetch(`/api/symbols?q=${encodeURIComponent(q)}`)
        const body = (await res.json()) as { matches?: Match[] }
        if (ticket !== latest.current) return
        setMatches(body.matches ?? [])
        setOpen(true)
      } catch {
        if (ticket === latest.current) setMatches([])
      }
    }, 200)
  }

  function go(symbol: string) {
    setOpen(false)
    router.push(`${basePath}/${encodeURIComponent(symbol)}`)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
      return
    }
    if (!open || matches.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => (i + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => (i <= 0 ? matches.length - 1 : i - 1))
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault()
      go(matches[highlighted].symbol)
    }
  }

  const showList = open && query.trim() !== ''

  return (
    <form action={basePath} method="get" role="search" className="relative mt-10 flex max-w-xl gap-3">
      <div className="relative flex-1">
        <label htmlFor={`${uid}-input`} className="sr-only">
          Ticker or company name
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          id={`${uid}-input`}
          type="search"
          name="q"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => matches.length > 0 && setOpen(true)}
          // Let a click on a suggestion land before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          required
          maxLength={40}
          placeholder="Ticker or company name"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted >= 0 ? `${uid}-option-${highlighted}` : undefined}
          className={`${field} py-3.5 pr-5 pl-11`}
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="animate-panel-in absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-black/[.08] bg-white py-1.5 shadow-xl shadow-black/[.08] dark:border-white/[.12] dark:bg-zinc-900 dark:shadow-black/50"
          >
            {matches.length === 0 ? (
              <li className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                No US-listed match for “{query.trim()}”.
              </li>
            ) : (
              matches.map((match, index) => (
                <li
                  key={match.symbol}
                  id={`${uid}-option-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    go(match.symbol)
                  }}
                  onPointerEnter={() => setHighlighted(index)}
                  className={`flex cursor-pointer items-baseline justify-between gap-4 px-4 py-2.5 text-sm ${
                    index === highlighted ? 'bg-black/[.05] dark:bg-white/[.08]' : ''
                  }`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-black dark:text-zinc-50">{match.symbol}</span>
                    <span className="ml-3 text-zinc-600 dark:text-zinc-400">{match.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{match.type}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <button type="submit" className={`${primaryButton} px-6`}>
        Search
      </button>
    </form>
  )
}
