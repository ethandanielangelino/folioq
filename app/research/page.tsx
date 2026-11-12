import type { Metadata } from 'next'
import MarketingShell from '@/app/components/marketing-shell'
import ResearchResults, { runSearch } from '@/app/components/research/research-results'
import SymbolSearch from '@/app/research/symbol-search'
import { PUBLIC_RESEARCH } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Research — FolioQ',
  description: 'Look up a US-listed stock or ETF: live price, company details, and recent news.',
}

type Props = { searchParams: Promise<{ q?: string | string[] }> }

// The public version. Signed-in visitors are sent to /dashboard/research by proxy.ts.
export default async function ResearchPage({ searchParams }: Props) {
  const { query, matches } = await runSearch((await searchParams).q, PUBLIC_RESEARCH)

  return (
    <MarketingShell
      title="Look up a stock before you write the thesis"
      lede="Search any US-listed stock or ETF for its live price, company details, and the past week’s news."
    >
      <SymbolSearch initialQuery={query} basePath={PUBLIC_RESEARCH} />
      <ResearchResults query={query} matches={matches} basePath={PUBLIC_RESEARCH} />
    </MarketingShell>
  )
}
