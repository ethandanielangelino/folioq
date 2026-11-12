import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SymbolView, { loadSymbol, parseSymbol } from '@/app/components/research/symbol-view'
import { APP_RESEARCH } from '@/lib/routes'
import { createClient } from '@/lib/supabase/server'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const symbol = parseSymbol((await params).symbol)
  return symbol ? { title: `${symbol} — FolioQ Research` } : {}
}

export default async function AppSymbolPage({ params }: Props) {
  const data = await loadSymbol((await params).symbol)
  if (!data) notFound()

  // Which of this person's portfolios already hold it. Row level security
  // limits both queries to their own rows.
  const supabase = await createClient()
  const { data: held } = await supabase
    .from('holdings')
    .select('portfolio_id')
    .eq('ticker', data.symbol)
  const ids = [...new Set(((held ?? []) as { portfolio_id: string }[]).map((h) => h.portfolio_id))]
  const { data: owners } =
    ids.length > 0
      ? await supabase.from('portfolios').select('id, name').in('id', ids)
      : { data: [] }
  const portfolios = (owners ?? []) as { id: string; name: string }[]

  return (
    <SymbolView
      data={data}
      basePath={APP_RESEARCH}
      aside={
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {portfolios.length === 0 ? (
            <span>None of your portfolios hold {data.symbol}.</span>
          ) : (
            <>
              <span>Held in</span>
              {portfolios.map((portfolio) => (
                <Link
                  key={portfolio.id}
                  href={`/dashboard/${portfolio.id}`}
                  className="rounded-full bg-mint-600/[.12] px-3 py-1 font-medium text-mint-800 transition-colors hover:bg-mint-600/20 dark:bg-mint-400/[.14] dark:text-mint-200"
                >
                  {portfolio.name}
                </Link>
              ))}
            </>
          )}
        </p>
      }
    />
  )
}
