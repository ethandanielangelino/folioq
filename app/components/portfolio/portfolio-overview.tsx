import AllocationBars from '@/app/components/portfolio/allocation-bars'
import HoldingsTable from '@/app/components/portfolio/holdings-table'
import PerformanceChart from '@/app/components/portfolio/performance-chart'
import StatTiles from '@/app/components/portfolio/stat-tiles'
import type { PortfolioView } from '@/lib/data'

/**
 * Totals, value history, allocation, and holdings — the part of a portfolio
 * page that the owner and a share-link visitor see identically.
 */
export default function PortfolioOverview({
  view,
  holdingActions,
  thesisTab,
  totalsFooter,
  researchBase,
}: {
  view: Pick<PortfolioView, 'holdings' | 'sectors' | 'totals' | 'history'>
  /** Per-holding controls for the owner, keyed by holding id. */
  holdingActions?: Record<string, React.ReactNode>
  /** Id of the tab that shows theses, so rows can link to theirs. */
  thesisTab?: string
  totalsFooter?: React.ReactNode
  /** Where ticker links lead. Defaults to the public research pages. */
  researchBase?: string
}) {
  const { holdings, sectors, totals, history } = view

  return (
    <>
      <StatTiles totals={totals} footer={totalsFooter} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <PerformanceChart points={history} />
        <div className="flex flex-col gap-6">
          <AllocationBars
            title="By holding"
            rows={holdings.map((h) => ({
              label: h.ticker,
              marketValue: h.marketValue,
              weight: h.weight,
            }))}
            emptyText="Nothing held right now."
          />
          <AllocationBars title="By sector" rows={sectors} emptyText="Nothing held right now." />
        </div>
      </div>

      <HoldingsTable
        holdings={holdings}
        actions={holdingActions}
        thesisTab={thesisTab}
        researchBase={researchBase}
      />
    </>
  )
}
