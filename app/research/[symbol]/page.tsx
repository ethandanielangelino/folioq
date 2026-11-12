import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MoneyProvider } from '@/app/components/money'
import SymbolView, { loadSymbol, parseSymbol } from '@/app/components/research/symbol-view'
import SiteFooter from '@/app/components/site-footer'
import SiteHeader from '@/app/components/site-header'
import { getMoney } from '@/lib/money'
import { PUBLIC_RESEARCH } from '@/lib/routes'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const symbol = parseSymbol((await params).symbol)
  if (!symbol) return {}
  return {
    title: `${symbol} — FolioQ Research`,
    description: `Live price, company details, and recent news for ${symbol}.`,
  }
}

// The public version. Signed-in visitors are sent to /dashboard/research by proxy.ts.
export default async function SymbolPage({ params }: Props) {
  const data = await loadSymbol((await params).symbol)
  if (!data) notFound()
  const money = await getMoney()

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-14 sm:px-10 sm:pt-20">
        <MoneyProvider value={money}>
          <SymbolView data={data} basePath={PUBLIC_RESEARCH} />
        </MoneyProvider>
      </main>
      <SiteFooter />
    </div>
  )
}
