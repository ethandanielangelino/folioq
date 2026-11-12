import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import Delta from '@/app/components/portfolio/delta'
import { card } from '@/app/components/styles'
import {
  getCompanyNews,
  getProfile,
  lookupQuote,
  normalizeSymbol,
  type CompanyProfile,
  type NewsItem,
  type Quote,
} from '@/lib/finnhub'
import { formatDate, formatMoney, formatMoneyCompact } from '@/lib/format'

export function parseSymbol(raw: string): string | null {
  try {
    return normalizeSymbol(decodeURIComponent(raw))
  } catch {
    return null
  }
}

export interface SymbolData {
  symbol: string
  quote: Quote | null
  profile: CompanyProfile | null
  news: NewsItem[]
}

/** Everything the page shows for one ticker, or null when there is no such ticker. */
export async function loadSymbol(raw: string): Promise<SymbolData | null> {
  const symbol = parseSymbol(raw)
  if (!symbol) return null

  const [lookup, profile, news] = await Promise.all([
    lookupQuote(symbol),
    getProfile(symbol),
    getCompanyNews(symbol),
  ])

  // Finnhub answered and has never heard of it: a real 404.
  if (lookup.status === 'unknown' && !profile) return null

  return { symbol, quote: lookup.status === 'ok' ? lookup.quote : null, profile, news }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-black tabular-nums dark:text-zinc-50">
        {children}
      </dd>
    </div>
  )
}

function timeInNewYork(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayInNewYork(unixSeconds: number): string {
  return formatDate(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
      new Date(unixSeconds * 1000)
    )
  )
}

/**
 * One ticker: price, company facts, and the week's headlines. Used by the
 * public research pages and by the ones inside the signed-in app; `basePath`
 * says which, so the back link stays in the same place.
 */
export default function SymbolView({
  data,
  basePath,
  aside,
}: {
  data: SymbolData
  basePath: string
  /** Optional extra block under the title, e.g. which of your portfolios hold it. */
  aside?: React.ReactNode
}) {
  const { symbol, quote, profile, news } = data

  return (
    <>
      <Link
        href={basePath}
        className="-ml-1 inline-flex items-center gap-1 rounded text-sm text-zinc-500 underline-offset-4 hover:text-black hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Research
      </Link>

      <header className="mt-5">
        <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">
          {profile?.name ?? symbol}
        </h1>
        <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
          {[symbol, profile?.exchange, profile?.industry].filter(Boolean).join(', ')}
        </p>
        {aside}
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={`${card} p-6 sm:p-8`}>
          <h2 className="sr-only">Price</h2>
          {quote ? (
            <>
              <p className="text-5xl font-semibold tracking-tight text-black sm:text-6xl dark:text-zinc-50">
                {formatMoney(quote.price)}
              </p>
              <p className="mt-3 text-base">
                <Delta amount={quote.change} ratio={quote.changePercent} />
                <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                  since the previous close
                </span>
              </p>
              <dl className="mt-6 divide-y divide-black/[.06] border-t border-black/[.06] dark:divide-white/[.08] dark:border-white/[.08]">
                <Fact label="Open">{formatMoney(quote.open)}</Fact>
                <Fact label="Day range">
                  {formatMoney(quote.low)} to {formatMoney(quote.high)}
                </Fact>
                <Fact label="Previous close">{formatMoney(quote.previousClose)}</Fact>
              </dl>
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Last trade {timeInNewYork(quote.timestamp)} New York time.
              </p>
            </>
          ) : (
            <div>
              <p className="text-lg font-medium text-black dark:text-zinc-50">
                The price isn&apos;t available right now
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                The market data provider didn&apos;t answer. Reload the page in a minute.
              </p>
            </div>
          )}
        </section>

        <section className={`${card} p-6 sm:p-8`}>
          <h2 className="text-xl text-black dark:text-zinc-50">Company</h2>
          {profile ? (
            <dl className="mt-3 divide-y divide-black/[.06] dark:divide-white/[.08]">
              {profile.industry && <Fact label="Industry">{profile.industry}</Fact>}
              {profile.marketCap !== null && (
                <Fact label="Market value">
                  {formatMoneyCompact(profile.marketCap * 1_000_000)}
                  {profile.currency && profile.currency !== 'USD' ? ` (${profile.currency})` : ''}
                </Fact>
              )}
              {profile.exchange && <Fact label="Exchange">{profile.exchange}</Fact>}
              {profile.country && <Fact label="Country">{profile.country}</Fact>}
              {profile.ipo && <Fact label="Listed since">{formatDate(profile.ipo)}</Fact>}
              {profile.website && (
                <Fact label="Website">
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {new URL(profile.website).hostname.replace(/^www\./, '')}
                  </a>
                </Fact>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              No company details are available for {symbol}. That is common for ETFs and funds.
            </p>
          )}
        </section>
      </div>

      <section className="mt-14 max-w-3xl">
        <h2 className="text-2xl text-black dark:text-zinc-50">News this week</h2>
        {news.length === 0 ? (
          <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
            No headlines for {symbol} in the past seven days.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-black/[.08] border-y border-black/[.08] dark:divide-white/[.1] dark:border-white/[.1]">
            {news.map((item) => (
              <li key={item.id} className="py-5">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base leading-7 font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  {item.headline}
                </a>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {item.source}, {dayInNewYork(item.datetime)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Prices, company details, and headlines come from Finnhub and link to outside sites.
          Nothing here is investment advice.
        </p>
      </section>
    </>
  )
}
