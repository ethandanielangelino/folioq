// Server-only: decides which outside information the assistant may use for a
// portfolio. It gets the market data the page itself used, each source named
// (Finnhub, Coinbase, Kraken, an exchange quoting crypto directly in the
// display currency, gold-api.com, the exchange-rate site) and, for the largest
// holdings, recent news headlines from the publishers in TRUSTED_PUBLISHERS.
// Nothing else.

import { isNewsReport, trustedPublisher, type AssistantSource } from '@/lib/assistant-format'
import { kindOf } from '@/lib/assets'
import type { Provider } from '@/lib/fx'
import type { PortfolioView } from '@/lib/data'
import { getCompanyNews } from '@/lib/finnhub'
import { formatDate, marketDate } from '@/lib/format'

export interface PromptSource extends AssistantSource {
  /** Extra context for the model that is not shown in the sources list. */
  ticker?: string
  summary?: string
  /** For market data: what in the portfolio data it supplied. */
  covers?: string
}

const list = (tickers: string[]) => {
  const unique = [...new Set(tickers)]
  return unique.length <= 1 ? (unique[0] ?? '') : `${unique.slice(0, -1).join(', ')} and ${unique.at(-1)}`
}

/** How many of the largest holdings get headlines, and how many each. */
const NEWS_HOLDINGS = 5
const NEWS_PER_HOLDING = 2

const tidy = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export async function gatherSources(
  view: PortfolioView,
  /** The display currency's rate and where it came from, when figures are converted. */
  display?: { code: string; provider: Provider | null }
): Promise<PromptSource[]> {
  const sources: PromptSource[] = []

  // The sources the page's own prices came from, one entry each, listed first.
  const day = formatDate(marketDate())
  const bySource = new Map<
    string,
    { url: string; listed: string[]; abroad: string[]; coins: string[]; venue: string[]; direct: string[]; metals: string[]; cash: string[] }
  >()
  for (const h of view.holdings) {
    const source = h.priceSource
    // A saved price has no outside source to cite; the data marks it as unpriced or stale.
    if (!source || source.saved || h.price === null || !source.url.startsWith('http')) continue
    const entry =
      bySource.get(source.name) ?? { url: source.url, listed: [], abroad: [], coins: [], venue: [], direct: [], metals: [], cash: [] }
    const kind = kindOf(h.assetClass)
    // The exchange chosen for a coin, then a coin quoted directly in the display currency.
    if (source.venue && source.pair) entry.venue.push(source.pair)
    else if (source.pair) entry.direct.push(source.pair)
    else if (kind === 'listed' && source.currency) entry.abroad.push(`${h.ticker} (in ${source.currency})`)
    else if (kind === 'listed') entry.listed.push(h.ticker)
    else if (kind === 'crypto') entry.coins.push(h.ticker)
    else if (kind === 'metal') entry.metals.push(h.ticker)
    else if (kind === 'cash') entry.cash.push(h.ticker)
    bySource.set(source.name, entry)
  }
  for (const [publisher, e] of bySource) {
    const parts = [
      e.listed.length > 0 && `the prices, values, company names, and sector labels of ${list(e.listed)} (in US dollars)`,
      e.abroad.length > 0 && `the prices, values, company names, and sector labels of ${list(e.abroad)}, converted to US dollars`,
      e.coins.length > 0 && `the prices, values, and 24-hour changes of ${list(e.coins)} (in US dollars)`,
      e.venue.length > 0 &&
        `the prices, values, and 24-hour changes of ${list(e.venue.map((p) => p.split('/')[0]))} on its ${list(e.venue)} market${e.venue.length > 1 ? 's' : ''}, the exchange chosen for them, converted to US dollars`,
      e.direct.length > 0 && `the prices and values of ${list(e.direct.map((p) => p.split('/')[0]))}, quoted directly in ${e.direct[0].split('/')[1]} on its ${list(e.direct)} market${e.direct.length > 1 ? 's' : ''}`,
      e.metals.length > 0 && `the prices and values of ${list(e.metals)} per troy ounce (in US dollars)`,
      e.cash.length > 0 && `the exchange rates behind the value of the ${list(e.cash)} cash`,
    ].filter(Boolean)
    sources.push({
      n: sources.length + 1,
      kind: 'market',
      publisher,
      title: `${e.cash.length > 0 && parts.length === 1 ? 'Exchange rates' : 'Live market data'}, retrieved ${day}`,
      url: e.url,
      covers: parts.join('; '),
    })
  }
  // Figures shown in another currency were converted at a rate from this site.
  if (display && display.code !== 'USD' && display.provider) {
    const existing = sources.find((s) => s.publisher === display.provider!.name)
    const covers = `the exchange rate used to show US-dollar figures in ${display.code}`
    if (existing) existing.covers = `${existing.covers}; ${covers}`
    else {
      sources.push({
        n: sources.length + 1,
        kind: 'market',
        publisher: display.provider.name,
        title: `US dollar to ${display.code} exchange rate, retrieved ${day}`,
        url: display.provider.url,
        covers,
      })
    }
  }

  // Headlines exist for listed companies only; a coin's symbol would match an unrelated company.
  const largest = view.holdings.filter((h) => kindOf(h.assetClass) === 'listed').slice(0, NEWS_HOLDINGS)
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
        ? `[${s.n}] ${s.publisher} market data: ${s.covers ?? 'prices'} in the portfolio data above, and the weights and totals they feed into. ${s.title}.`
        : `[${s.n}] ${s.publisher}, about ${s.ticker}: "${s.title}"${s.summary ? ` Summary: ${s.summary}` : ''}`
    )
    .join('\n')
}
