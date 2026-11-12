import type { Metadata } from 'next'
import MarketingShell, { Section, SignupCta } from '@/app/components/marketing-shell'
import AllocationBars from '@/app/components/portfolio/allocation-bars'
import HoldingsTable from '@/app/components/portfolio/holdings-table'
import PerformanceChart from '@/app/components/portfolio/performance-chart'
import StatTiles from '@/app/components/portfolio/stat-tiles'
import ThesisList from '@/app/components/portfolio/thesis-list'
import Specimen from '@/app/components/specimen'
import {
  sampleHoldings,
  samplePoints,
  sampleSectors,
  sampleTotals,
} from '@/lib/sample'

export const metadata: Metadata = {
  title: 'Product — FolioQ',
  description:
    'How FolioQ works: a written thesis for every holding, live values and allocation, an AI assistant that tests your reasoning, and read-only sharing.',
}

const limits = [
  {
    term: 'It doesn’t connect to a brokerage.',
    detail: 'You enter each position yourself. Nothing is imported, and nothing is ever ordered.',
  },
  {
    term: 'It covers US-listed stocks and ETFs.',
    detail: 'Prices come from Finnhub and are shown in US dollars.',
  },
  {
    term: 'It tracks positions, not transactions.',
    detail:
      'You keep each holding’s share count and average cost up to date. Individual trades, cash, dividends, and fees are not recorded, so gain means price gain on what you hold now.',
  },
  {
    term: 'History starts when you do.',
    detail:
      'Closing prices are saved from the day a ticker is first held. The chart can’t reach back further than that.',
  },
]

export default function ProductPage() {
  return (
    <MarketingShell
      title="Every position, and the reason it’s there"
      lede="FolioQ keeps two things side by side: what a portfolio holds, and the written thesis for each holding. When someone asks why the fund owns a stock, the answer is already on the page."
    >
      <Section title="A thesis for every holding" wide>
        <p className="max-w-2xl">
          Each position gets a claim, the assumptions it rests on, and the risks you accept by
          holding it. Editing a thesis saves a new version and keeps the old ones, so the record
          shows how your thinking moved, not just where it ended up.
        </p>
        <Specimen caption="Theses for an example student fund. One holding has none, and the page says so.">
          <ThesisList holdings={sampleHoldings} />
        </Specimen>
      </Section>

      <Section title="Start from a draft, finish in your own words">
        <p>
          A blank box is hard. Ask for an AI draft and FolioQ writes a first version from the
          company, your mandate, the size of the position, and the week&apos;s headlines. Then you
          rewrite it until it is what you actually believe.
        </p>
        <p>
          FolioQ keeps track of which is which. A draft saved without changes is labelled
          &ldquo;AI draft&rdquo; everywhere it appears, including on shared links, so nobody
          mistakes a machine&apos;s guess for your reasoning.
        </p>
      </Section>

      <Section title="Values work themselves out" wide>
        <p className="max-w-2xl">
          Enter a ticker, a share count, and your average cost. Live prices give each holding its
          value, its weight in the portfolio, today&apos;s move, and its gain against what you
          paid.
        </p>
        <Specimen caption="Totals and holdings for the same fund.">
          <div className="flex flex-col gap-6">
            <StatTiles totals={sampleTotals} />
            <HoldingsTable holdings={sampleHoldings} />
          </div>
        </Specimen>
      </Section>

      <Section title="See where the money sits" wide>
        <p className="max-w-2xl">
          Allocation is shown two ways, by holding and by sector, largest first. Concentration is
          the first thing most stakeholders ask about, so it is on the page without anyone having
          to build a chart.
        </p>
        <Specimen caption="Allocation for the same fund.">
          <div className="grid gap-6 md:grid-cols-2">
            <AllocationBars
              title="By holding"
              rows={sampleHoldings.map((h) => ({
                label: h.ticker,
                marketValue: h.marketValue,
                weight: h.weight,
              }))}
              emptyText=""
            />
            <AllocationBars title="By sector" rows={sampleSectors} emptyText="" />
          </div>
        </Specimen>
      </Section>

      <Section title="Value over time, against what it cost" wide>
        <p className="max-w-2xl">
          Each weekday evening FolioQ saves the closing price of everything you hold. The chart
          plots what those positions were worth on each day alongside what they cost, so the gap
          between the two lines is the gain.
        </p>
        <Specimen caption="Market value against cost basis.">
          <PerformanceChart points={samplePoints} />
        </Specimen>
      </Section>

      <Section title="An assistant that questions your reasoning">
        <p>
          Each portfolio has a conversation with an AI assistant that can read its holdings and
          theses. Ask it where you are most concentrated, which thesis is weakest against the
          numbers, or what the people you report to are likely to ask.
        </p>
        <p>
          It is built to probe, not to pick stocks: it won&apos;t tell you what to buy or sell.
          It is also a language model, so it can be wrong. Only the portfolio&apos;s owner sees
          the conversation.
        </p>
      </Section>

      <Section title="A link instead of a login">
        <p>
          Turn sharing on and a portfolio gets a private link. Anyone you send it to sees the
          holdings, the values, and the thesis for each position, without an account and without
          any way to change a thing.
        </p>
        <p>
          Turn sharing off and the link stops working for everyone. Turning it on again creates a
          new link, so an old one can&apos;t be revived.
        </p>
      </Section>

      <Section title="What FolioQ doesn’t do">
        <p>Knowing the edges matters more than a feature list.</p>
        <dl className="flex flex-col gap-5">
          {limits.map((limit) => (
            <div key={limit.term} className="border-l-2 border-black/15 pl-4 dark:border-white/20">
              <dt className="font-medium text-black dark:text-zinc-50">{limit.term}</dt>
              <dd className="mt-1">{limit.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <SignupCta />
    </MarketingShell>
  )
}
