import type { Metadata } from 'next'
import ResearchResults, { runSearch } from '@/app/components/research/research-results'
import SymbolSearch from '@/app/research/symbol-search'
import { APP_RESEARCH } from '@/lib/routes'

export const metadata: Metadata = { title: 'Research — FolioQ' }

type Props = { searchParams: Promise<{ q?: string | string[] }> }

// Research inside the signed-in app: same lookups as the public pages, but
// every link stays under /dashboard so the sidebar never goes away.
export default async function AppResearchPage({ searchParams }: Props) {
  const { query, matches } = await runSearch((await searchParams).q, APP_RESEARCH)

  return (
    <>
      <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">Research</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
        Look up any US-listed stock or ETF before you write its thesis: live price, company
        details, and the past week&apos;s news.
      </p>
      <SymbolSearch initialQuery={query} basePath={APP_RESEARCH} />
      <ResearchResults query={query} matches={matches} basePath={APP_RESEARCH} />
    </>
  )
}
