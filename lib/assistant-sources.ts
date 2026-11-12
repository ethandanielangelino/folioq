// Server-only: decides which outside information the assistant may use for a
// portfolio. It gets Finnhub's market data and, for the largest holdings,
// recent news headlines from the publishers in TRUSTED_PUBLISHERS. Nothing else.

import { isNewsReport, trustedPublisher, type AssistantSource } from '@/lib/assistant-format'
import type { PortfolioView } from '@/lib/data'
import { getCompanyNews } from '@/lib/finnhub'
import { formatDate, marketDate } from '@/lib/format'

export interface PromptSource extends AssistantSource {
  /** Extra context for the model that is not shown in the sources list. */
  ticker?: string
  summary?: string
}

/** How many of the largest holdings get headlines, and how many each. */
const NEWS_HOLDINGS = 5
const NEWS_PER_HOLDING = 2

const tidy = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export async function gatherSources(view: PortfolioView): Promise<PromptSource[]> {
  const sources: PromptSource[] = []

  if (view.holdings.some((h) => h.price !== null)) {
    sources.push({
      n: 1,
      kind: 'market',
      publisher: 'Finnhub',
      title: `Live quotes and company profiles, retrieved ${formatDate(marketDate())}`,
      url: 'https://finnhub.io',
    })
  }

  const largest = view.holdings.slice(0, NEWS_HOLDINGS)
  const news = await Promise.all(largest.map((h) => getCompanyNews(h.ticker, 30)))
  const seen = new Set<string>()

  largest.forEach((holding, index) => {
    let taken = 0
    for (const item of news[index]) {
      if (taken >= NEWS_PER_HOLDING) break
      const publisher = trustedPublisher(item.source)
      const key = item.headline.toLowerCase()
      if (!publisher || !isNewsReport(item.headline) || seen.has(key)) continue
      seen.add(key)
      taken += 1

      const day = formatDate(new Date(item.datetime * 1000).toISOString())
      sources.push({
        n: sources.length + 1,
        kind: 'news',
        publisher,
        title: `${tidy(item.headline, 140)}, ${day}`,
        url: item.url,
        ticker: holding.ticker,
        summary: item.summary ? tidy(item.summary, 280) : undefined,
      })
    }
  })

  // Market data is always [1] when present; keep the numbers gap-free otherwise.
  return sources.map((source, index) => ({ ...source, n: index + 1 }))
}

/** The sources as the model sees them, under the portfolio data. */
export function describeSources(sources: PromptSource[]): string {
  if (sources.length === 0) return 'None are available right now.'
  return sources
    .map((s) =>
      s.kind === 'market'
        ? `[${s.n}] ${s.publisher} market data: the prices, values, gains, weights, company names, and sector labels in the portfolio data above. ${s.title}.`
        : `[${s.n}] ${s.publisher}, about ${s.ticker}: "${s.title}"${s.summary ? ` Summary: ${s.summary}` : ''}`
    )
    .join('\n')
}
