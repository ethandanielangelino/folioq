import Link from 'next/link'
import { redirect } from 'next/navigation'
import { normalizeSymbol, searchSymbols, type SymbolMatch } from '@/lib/finnhub'

const startingPoints = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'KO', name: 'Coca-Cola' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
]

/** Reads `?q=` and looks it up. An exact ticker goes straight to its page. */
export async function runSearch(
  raw: string | string[] | undefined,
  basePath: string
): Promise<{ query: string; matches: SymbolMatch[] }> {
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 40) ?? ''
  const matches = query ? await searchSymbols(query, 12) : []

  const exact = normalizeSymbol(query)
  if (exact && matches.some((m) => m.symbol === exact)) {
    redirect(`${basePath}/${encodeURIComponent(exact)}`)
  }
  return { query, matches }
}

/** Search results, or a few well-known tickers when nothing has been searched. */
export default function ResearchResults({
  query,
  matches,
  basePath,
}: {
  query: string
  matches: SymbolMatch[]
  basePath: string
}) {
  if (!query) {
    return (
      <section className="mt-12 max-w-2xl">
        <h2 className="text-2xl text-black dark:text-zinc-50">Common starting points</h2>
        <ul className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {startingPoints.map((item) => (
            <li key={item.symbol} className="border-t border-black/[.08] dark:border-white/[.1]">
              <Link
                href={`${basePath}/${item.symbol}`}
                className="flex items-baseline gap-3 py-3.5 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <span className="w-14 font-semibold text-black dark:text-zinc-50">{item.symbol}</span>
                <span className="text-zinc-600 dark:text-zinc-400">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="mt-12 max-w-2xl" aria-live="polite">
      <h2 className="text-2xl text-black dark:text-zinc-50">
        {matches.length === 0
          ? `Nothing found for “${query}”`
          : `${matches.length === 1 ? '1 match' : `${matches.length} matches`} for “${query}”`}
      </h2>
      {matches.length === 0 ? (
        <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Check the spelling, or try the ticker symbol instead of the company name. Only US-listed
          stocks and ETFs are covered.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-black/[.08] border-y border-black/[.08] dark:divide-white/[.1] dark:border-white/[.1]">
          {matches.map((match) => (
            <li key={match.symbol}>
              <Link
                href={`${basePath}/${encodeURIComponent(match.symbol)}`}
                className="flex items-baseline justify-between gap-4 py-4 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-black dark:text-zinc-50">{match.symbol}</span>
                  <span className="ml-3 text-zinc-600 dark:text-zinc-400">{match.description}</span>
                </span>
                <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">{match.type}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
