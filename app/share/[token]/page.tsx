import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LiveRefresh } from '@/app/components/portfolio/live'
import PortfolioOverview from '@/app/components/portfolio/portfolio-overview'
import PortfolioTabs from '@/app/components/portfolio/tabs'
import ThesisList from '@/app/components/portfolio/thesis-list'
import { MoneyProvider } from '@/app/components/money'
import ThemeToggle from '@/app/components/theme-toggle'
import { getSharedPortfolioView } from '@/lib/data'
import { getMoney } from '@/lib/money'

type Props = { params: Promise<{ token: string }> }

// Share links are private by obscurity: keep them out of search engines.
export const metadata: Metadata = {
  title: 'Shared portfolio — FolioQ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function SharedPortfolioPage({ params }: Props) {
  const { token } = await params
  const view = await getSharedPortfolioView(token)
  if (!view) notFound()

  const { portfolio, holdings } = view
  const money = await getMoney()

  return (
    <MoneyProvider value={money}>
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="px-4 pt-3 sm:px-6 sm:pt-4">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-full border border-black/[.07] bg-white/70 py-2 pr-3 pl-4 sm:pl-5 dark:border-white/[.08] dark:bg-zinc-900/60">
          <Link href="/" className="flex items-center gap-2.5 rounded-full">
            <Image
              src="/FolioQ-logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
              FolioQ
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="rounded-full bg-sky-tint px-3 py-1.5 text-xs font-medium text-black">
              Read-only view
            </span>
          </div>
        </header>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
        <div>
          <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">
            {portfolio.name}
          </h1>
          {portfolio.mandate && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {portfolio.mandate}
            </p>
          )}
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            The owner of this portfolio shared it with you. Prices are live, and each holding is
            listed with the owner&apos;s written reason for holding it.
          </p>
        </div>

        {holdings.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-black/[.12] bg-white px-6 py-14 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-400">
            This portfolio has no holdings yet.
          </p>
        ) : (
          <PortfolioTabs
            label="Portfolio sections"
            tabs={[
              {
                id: 'overview',
                label: 'Overview',
                content: (
                  <PortfolioOverview
                    view={view}
                    thesisTab="theses"
                    totalsFooter={<LiveRefresh renderedAt={view.fetchedAt} />}
                  />
                ),
              },
              {
                id: 'theses',
                label: 'Theses',
                badge: `${holdings.filter((h) => h.thesis).length} of ${holdings.filter((h) => h.assetClass !== 'cash').length}`,
                content: <ThesisList holdings={holdings.filter((h) => h.assetClass !== 'cash')} />,
              },
            ]}
          />
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-xs leading-5 text-zinc-500 sm:px-10 lg:px-16 dark:text-zinc-400">
        Shared with FolioQ. Figures are for information only and are not investment advice.
      </footer>
    </div>
    </MoneyProvider>
  )
}
