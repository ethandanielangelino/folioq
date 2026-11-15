// How assistant answers carry their sources. Pure functions with no imports,
// so they run in the browser, on the server, and under plain `node --test`.
//
// A saved answer is Markdown text. When it relied on outside information it
// ends with a block like this, which the app writes (never the model):
//
//   Sources
//   [1] Finnhub: Live quotes and company profiles, retrieved Nov 12, 2026 <https://finnhub.io>
//   [2] Reuters: Microsoft lifts cloud forecast, Nov 10, 2026 <https://…>

export interface AssistantSource {
  /** The number used to cite it, e.g. 2 for "[2]". */
  n: number
  publisher: string
  title: string
  url: string
  /** "market" is Finnhub price data; "news" is a headline from a trusted publisher. */
  kind?: 'market' | 'news'
}

/**
 * The only news publishers the assistant is ever shown. Headlines arrive from
 * Finnhub labelled with their publisher; anything not on this list is dropped
 * before the assistant sees it. `match` is compared against that label.
 *
 * These are newsrooms with their own reporting and corrections. Aggregators
 * and contributor sites are left off on purpose: Finnhub's "Yahoo" label, for
 * example, covers syndicated stock-pick columns as well as news, with no way
 * to tell which outlet wrote a given piece.
 */
export const TRUSTED_PUBLISHERS: { name: string; match: string[] }[] = [
  { name: 'Reuters', match: ['reuters'] },
  { name: 'Bloomberg', match: ['bloomberg'] },
  { name: 'The Wall Street Journal', match: ['wsj', 'wallstreetjournal'] },
  { name: 'Dow Jones Newswires', match: ['dowjones'] },
  { name: 'Financial Times', match: ['financialtimes', 'ft'] },
  { name: 'Associated Press', match: ['associatedpress', 'ap', 'apnews'] },
  { name: 'CNBC', match: ['cnbc'] },
  { name: 'MarketWatch', match: ['marketwatch'] },
  { name: 'Barron’s', match: ['barrons'] },
]

/** The publisher's proper name if it is on the trusted list, otherwise null. */
export function trustedPublisher(label: string | null | undefined): string | null {
  const key = (label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!key) return null
  return TRUSTED_PUBLISHERS.find((p) => p.match.includes(key))?.name ?? null
}

/**
 * Headlines that sell a trade rather than report an event ("3 stocks to buy
 * now", "Is it a buy?"). The assistant must not pass on anyone's buy or sell
 * call, so these are dropped even when a trusted publisher ran them.
 */
const PITCH =
  /\b(?:better buy|(?:stocks?|shares?|etfs?|funds?) to (?:buy|sell|own|watch|avoid)|should you (?:buy|sell|own|invest)|time to (?:buy|sell)|buy (?:now|the dip|and hold)|is (?:it|this|[a-z]+) a (?:buy|sell)|what i'?d do|i'?d (?:buy|sell)|i'?m (?:buying|selling)|price targets?|top (?:stock )?picks?|strong (?:buy|sell)|millionaire|upgrades? to (?:buy|sell)|downgrades? to (?:buy|sell))\b/i

export function isNewsReport(headline: string): boolean {
  return !PITCH.test(headline.replace(/[’‘]/g, "'"))
}

const HEADING = '\n\nSources\n'
const LINE = /^\[(\d+)\] (.+?): (.+) <(https?:\/\/[^>\s]+)>$/

const oneLine = (text: string) => text.replace(/[\s<>]+/g, ' ').trim()

export function formatSources(sources: AssistantSource[]): string {
  if (sources.length === 0) return ''
  const lines = sources.map(
    (s) => `[${s.n}] ${oneLine(s.publisher).replace(/:/g, '')}: ${oneLine(s.title)} <${s.url}>`
  )
  return `${HEADING}${lines.join('\n')}`
}

/** Separates a saved answer into its text and the sources listed under it. */
export function splitSources(content: string): { body: string; sources: AssistantSource[] } {
  const at = content.lastIndexOf(HEADING)
  if (at === -1) return { body: content, sources: [] }

  const sources: AssistantSource[] = []
  for (const line of content.slice(at + HEADING.length).split('\n')) {
    const match = LINE.exec(line.trim())
    // Anything unexpected means this wasn't a block the app wrote: leave it alone.
    if (!match) return { body: content, sources: [] }
    sources.push({ n: Number(match[1]), publisher: match[2], title: match[3], url: match[4] })
  }
  return { body: content.slice(0, at).trimEnd(), sources }
}

/** A source list the model wrote on its own, despite being told the app adds it. */
const OWN_LIST = /\n[ \t]*(?:[#*_>-]+[ \t]*)*(?:sources?|references?|citations?)[ \t]*[:*_]*[ \t]*\n[\s\S]*$/i

/**
 * Turns the model's raw answer into what is saved and shown:
 * - drops any source list it wrote itself
 * - removes citations to numbers that were never offered
 * - renumbers what is left 1, 2, 3 in order of first use
 * - appends the sources block, built from the list the app supplied
 *
 * Figures in an answer come from prices, so when an answer quotes money or
 * percentages the market-data source is listed even if it went uncited.
 */
export function finalizeAnswer(raw: string, available: AssistantSource[]): string {
  let body = raw.replace(/\r\n/g, '\n').trim()
  body = body.replace(OWN_LIST, '').trimEnd()

  // "[1, 2]", "[1,3]" and "[1-3]" become "[1][2]" and so on, so every source is seen.
  body = body.replace(/\[(\d+(?:\s*(?:,|–|-|and)\s*\d+)+)\]/g, (_whole, inside: string) => {
    const numbers: number[] = []
    for (const part of inside.split(/\s*(?:,|and)\s*/)) {
      const range = part.match(/^(\d+)\s*[–-]\s*(\d+)$/)
      if (range) {
        const [from, to] = [Number(range[1]), Number(range[2])]
        for (let n = from; n <= to && n - from < 20; n++) numbers.push(n)
      } else if (/^\d+$/.test(part.trim())) {
        numbers.push(Number(part))
      }
    }
    return numbers.map((n) => `[${n}]`).join('')
  })

  const byNumber = new Map(available.map((s) => [s.n, s]))
  const order: number[] = []
  body.replace(/\[(\d+)\]/g, (whole, digits: string) => {
    const n = Number(digits)
    if (byNumber.has(n) && !order.includes(n)) order.push(n)
    return whole
  })

  const market = available.find((s) => s.kind === 'market')
  // A currency symbol or code followed by a number, or a percentage.
  const quotesFigures = /(?:[$€£¥₱₹₩₺₪]|\b[A-Z]{3}[\s\u00a0])\s?\d|\d\s?%/.test(body)
  if (market && quotesFigures && !order.includes(market.n)) order.push(market.n)

  const renumbered = new Map(order.map((n, index) => [n, index + 1]))
  body = body
    .replace(/[ \t]*\[(\d+)\]/g, (_whole, digits: string) => {
      const next = renumbered.get(Number(digits))
      // Keep the citation only if it points at a real source that this answer cites.
      return next ? ` [${next}]` : ''
    })
    // The same source cited twice in a row reads as a stutter.
    .replace(/( \[\d+\])(?:\1)+/g, '$1')
    // Citations sit after the sentence's punctuation, like a footnote mark.
    .replace(/((?: \[\d+\])+)([.,;:!?])/g, '$2$1')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .trim()

  const used = order.map((n) => ({ ...(byNumber.get(n) as AssistantSource), n: renumbered.get(n) as number }))
  return body + formatSources(used)
}
