import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SymbolView, { loadSymbol, parseSymbol } from '@/app/components/research/symbol-view'
import SiteFooter from '@/app/components/site-footer'
import SiteHeader from '@/app/components/site-header'
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-14 sm:px-10 sm:pt-20">
        <SymbolView data={data} basePath={PUBLIC_RESEARCH} />
      </main>
      <SiteFooter />
    </div>
  )
}
