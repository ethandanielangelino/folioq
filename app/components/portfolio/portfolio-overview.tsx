import AllocationBars from '@/app/components/portfolio/allocation-bars'
import CashCard from '@/app/components/portfolio/cash-card'
import HoldingsTable from '@/app/components/portfolio/holdings-table'
import PerformanceChart from '@/app/components/portfolio/performance-chart'
import StatTiles from '@/app/components/portfolio/stat-tiles'
import type { PortfolioView } from '@/lib/data'
import type { HistoryContext } from '@/app/components/portfolio/holding-history'

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
  canAddCash = false,
  holdingHistory,
  cashControls,
}: {
  view: Pick<PortfolioView, 'holdings' | 'sectors' | 'totals' | 'history'> &
    Partial<Pick<PortfolioView, 'assetGroups' | 'hasCrypto' | 'historyReplayed'>>
  /** Per-holding controls for the owner, keyed by holding id. */
  holdingActions?: Record<string, React.ReactNode>
  /** Id of the tab that shows theses, so rows can link to theirs. */
  thesisTab?: string
  totalsFooter?: React.ReactNode
  /** Where ticker links lead. Defaults to the public research pages. */
  researchBase?: string
  /** Whether this person can add cash (owners and editors). */
  canAddCash?: boolean
  /** Holding history, for signed-in people with access. Left out on public share links. */
  holdingHistory?: HistoryContext
  /** Add money and Take money out, for owners and editors. */
  cashControls?: React.ReactNode
}) {
  const { holdings, sectors, totals, history } = view
  const assetGroups = view.assetGroups ?? []
  // Investments and cash are shown apart: what is invested, and what is held as money.
  const invested = holdings.filter((h) => h.assetClass !== 'cash')
  const cash = holdings.filter((h) => h.assetClass === 'cash')
  const cashValue = cash.reduce((sum, h) => sum + h.marketValue, 0)

  return (
    <>
      <StatTiles
        totals={totals}
        cash={cash.length > 0 ? cashValue : null}
        footer={totalsFooter}
        todayHint={
          view.hasCrypto ? 'Since the previous close; crypto over the last 24 hours' : undefined
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <PerformanceChart points={history} replayed={view.historyReplayed ?? false} />
        <div className="flex flex-col gap-6">
          {/* Shown once there is more than one kind of asset to compare. */}
          {assetGroups.length > 1 && (
            <AllocationBars title="By asset type" rows={assetGroups} emptyText="Nothing held right now." />
          )}
          <AllocationBars
            title="By holding"
            rows={holdings.map((h) => ({
              label: h.ticker,
              marketValue: h.marketValue,
              weight: h.weight,
            }))}
            emptyText="Nothing held right now."
          />
          {sectors.length > 0 && (
            <AllocationBars
              title={assetGroups.length > 1 ? 'Stocks by sector' : 'By sector'}
              rows={sectors}
              note={
                <>
                  Industries from{' '}
                  <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    Finnhub
                  </a>
                  &apos;s company profiles.
                </>
              }
              emptyText="Nothing held right now."
            />
          )}
        </div>
      </div>

      {invested.length > 0 && (
        <HoldingsTable
          holdings={invested}
          actions={holdingActions}
          thesisTab={thesisTab}
          researchBase={researchBase}
          history={holdingHistory}
        />
      )}

      <CashCard cash={cash} actions={holdingActions} canAdd={canAddCash} history={holdingHistory} controls={cashControls} />
    </>
  )
}
