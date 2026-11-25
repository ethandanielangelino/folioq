// A made-up portfolio used to show the product on public pages. It runs
// through the same maths as real portfolios; the prices are invented.

import type { Holding, SectorSlice } from '@/lib/data'
import {
  buildHistory,
  computeTotals,
  valueHoldings,
  type DailyClose,
  type HoldingInput,
  type PriceQuote,
} from '@/lib/portfolio'
import type { Thesis } from '@/lib/types'

const inputs: HoldingInput[] = [
  { id: 'sample-msft', ticker: 'MSFT', quantity: 28, costBasis: 412.5, openedAt: '2026-02-03' },
  { id: 'sample-ko', ticker: 'KO', quantity: 120, costBasis: 68.2, openedAt: '2026-03-12' },
  { id: 'sample-jpm', ticker: 'JPM', quantity: 30, costBasis: 241, openedAt: '2026-05-20' },
]

const quotes: Record<string, PriceQuote> = {
  MSFT: { price: 455.1, change: 3.2 },
  KO: { price: 71.45, change: -0.18 },
  JPM: { price: 262.3, change: 1.05 },
}

const profiles: Record<string, { name: string; industry: string }> = {
  MSFT: { name: 'Microsoft Corp', industry: 'Technology' },
  KO: { name: 'Coca-Cola Co', industry: 'Beverages' },
  JPM: { name: 'JPMorgan Chase & Co', industry: 'Banking' },
}

function thesis(
  holdingId: string,
  version: number,
  date: string,
  authorEdited: boolean,
  claim: string,
  assumptions: string[],
  risks: string[]
): Thesis {
  return {
    id: `${holdingId}-v${version}`,
    holdingId,
    version,
    claim,
    assumptions,
    risks,
    authorEdited,
    createdAt: `${date}T15:00:00Z`,
  }
}

const theses: Record<string, Thesis[]> = {
  'sample-msft': [
    thesis(
      'sample-msft',
      2,
      '2026-08-14',
      true,
      'Cloud and productivity software give the fund a growth holding whose revenue recurs. We hold it as the largest position, capped at 45% of the fund.',
      [
        'Cloud revenue keeps growing faster than 15% a year.',
        'Operating margin stays above 40% while AI spending rises.',
        'Enterprise customers keep renewing multi-year contracts.',
      ],
      [
        'Spending on data centers outruns the revenue it brings in.',
        'A regulator forces changes to how products are bundled.',
        'At 44% of the fund, one bad quarter moves everything.',
      ]
    ),
    thesis(
      'sample-msft',
      1,
      '2026-02-03',
      false,
      'Microsoft offers durable growth through its cloud platform and recurring software revenue, which fits a long-only equity mandate.',
      ['Cloud demand continues to grow.', 'Margins remain stable.'],
      ['Competition in cloud services.', 'Regulatory scrutiny.']
    ),
  ],
  'sample-ko': [
    thesis(
      'sample-ko',
      1,
      '2026-03-12',
      true,
      'A defensive anchor. Pricing has held through two years of input-cost swings, and the dividend pays the fund while its growth holdings are volatile.',
      [
        'Price increases keep sticking without volume falling.',
        'The dividend is raised again this year.',
      ],
      [
        'A strong dollar cuts the value of overseas earnings.',
        'Shoppers trade down to store brands if prices keep rising.',
      ]
    ),
  ],
}

const valued = valueHoldings(inputs, quotes)

export const sampleHoldings: Holding[] = valued.map((h) => {
  const versions = theses[h.id] ?? []
  return {
    ...h,
    assetClass: 'stock' as const,
    key: h.ticker,
    venue: null,
    name: profiles[h.ticker].name,
    industry: profiles[h.ticker].industry,
    thesis: versions[0] ?? null,
    thesisHistory: versions.slice(1),
    // Invented prices, labelled as such so the sample never passes them off as real.
    priceSource: { name: 'Made-up example', url: '' },
  }
})

export const sampleSectors: SectorSlice[] = sampleHoldings
  .map((h) => ({ label: h.industry ?? 'Other', marketValue: h.marketValue, weight: h.weight }))
  .sort((a, b) => b.marketValue - a.marketValue)

export const sampleTotals = computeTotals(valued)

// Invented closing prices; the chart is built from them the same way a real one is.
const closes: [string, number, number | null, number | null][] = [
  // date, MSFT, KO, JPM
  ['2026-02-03', 412.5, null, null],
  ['2026-02-27', 404.2, null, null],
  ['2026-03-12', 418.9, 68.2, null],
  ['2026-04-15', 409.4, 67.1, null],
  ['2026-05-20', 431.0, 69.8, 241.0],
  ['2026-06-18', 446.3, 70.4, 248.6],
  ['2026-07-22', 471.8, 69.2, 255.1],
  ['2026-08-14', 468.0, 70.9, 251.7],
  ['2026-09-16', 449.5, 72.3, 258.4],
  ['2026-10-14', 452.7, 71.0, 260.9],
  ['2026-11-06', 455.1, 71.45, 262.3],
]

const dailyCloses: DailyClose[] = closes.flatMap(([date, msft, ko, jpm]) => {
  const rows: DailyClose[] = [{ ticker: 'MSFT', date, close: msft }]
  if (ko !== null) rows.push({ ticker: 'KO', date, close: ko })
  if (jpm !== null) rows.push({ ticker: 'JPM', date, close: jpm })
  return rows
})

export const samplePoints = buildHistory(inputs, dailyCloses)
