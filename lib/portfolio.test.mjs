// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHistory, computeTotals, valueHoldings } from './portfolio.ts'

let counter = 0
function holding(ticker, quantity, costBasis, openedAt = '2026-01-05') {
  counter += 1
  return { id: `h${counter}`, ticker, quantity, costBasis, openedAt }
}

function near(actual, expected, message) {
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-6,
    `${message ?? ''} expected ${expected}, got ${actual}`
  )
}

test('a holding is valued at quantity times price, with gain against cost', () => {
  const [h] = valueHoldings([holding('AAPL', 10, 150)], { AAPL: { price: 180, change: 2 } })
  near(h.marketValue, 1800)
  near(h.cost, 1500)
  near(h.gain, 300)
  near(h.gainPct, 0.2)
  near(h.dayChange, 20)
  near(h.weight, 1)
})

test('a loss is a negative gain', () => {
  const [h] = valueHoldings([holding('TSLA', 4, 250)], { TSLA: { price: 200, change: -5 } })
  near(h.gain, -200)
  near(h.gainPct, -0.2)
  near(h.dayChange, -20)
})

test('holdings are sorted by value and weights sum to one', () => {
  const valued = valueHoldings(
    [holding('AAPL', 10, 100), holding('MSFT', 10, 300), holding('KO', 1, 60)],
    { AAPL: { price: 120, change: 0 }, MSFT: { price: 280, change: 0 }, KO: { price: 70, change: 0 } }
  )
  assert.deepEqual(valued.map((h) => h.ticker), ['MSFT', 'AAPL', 'KO'])
  near(valued.reduce((sum, h) => sum + h.weight, 0), 1)
  near(valued[0].weight, 2800 / 4070)
})

test('fractional quantities work', () => {
  const [h] = valueHoldings([holding('VOO', 0.25, 400)], { VOO: { price: 500, change: 4 } })
  near(h.marketValue, 125)
  near(h.cost, 100)
  near(h.gain, 25)
  near(h.dayChange, 1)
})

test('a holding without a quote is carried at cost and has no gain', () => {
  const [h] = valueHoldings([holding('XYZ', 5, 40)], { XYZ: null })
  assert.equal(h.price, null)
  near(h.marketValue, 200)
  assert.equal(h.gain, null)
  assert.equal(h.gainPct, null)
  assert.equal(h.dayChange, null)
})

test('a holding without a cost has a value but no gain', () => {
  const [h] = valueHoldings([holding('AAPL', 10, null)], { AAPL: { price: 180, change: 1 } })
  near(h.marketValue, 1800)
  assert.equal(h.cost, null)
  assert.equal(h.gain, null)
  assert.equal(h.gainPct, null)
})

test('a holding with neither quote nor cost is worth zero rather than NaN', () => {
  const [h] = valueHoldings([holding('XYZ', 5, null)], {})
  assert.equal(h.marketValue, 0)
  assert.equal(h.weight, 0)
})

test('zero-quantity holdings are left out', () => {
  assert.deepEqual(valueHoldings([holding('AAPL', 0, 100)], { AAPL: { price: 1, change: 0 } }), [])
})

test('totals add up across holdings', () => {
  const valued = valueHoldings(
    [holding('AAPL', 10, 100), holding('MSFT', 10, 300)],
    { AAPL: { price: 120, change: 2 }, MSFT: { price: 280, change: -5 } }
  )
  const totals = computeTotals(valued)
  near(totals.marketValue, 4000)
  near(totals.costBasis, 4000)
  near(totals.gain, 0)
  near(totals.gainPct, 0)
  near(totals.dayChange, -30)
  near(totals.dayChangePct, -30 / 4030)
  assert.deepEqual(totals.unpriced, [])
  assert.deepEqual(totals.uncosted, [])
})

test('total gain ignores holdings that lack a price or a cost, and flags them', () => {
  const valued = valueHoldings(
    [holding('AAPL', 10, 100), holding('NOCOST', 2, null), holding('NOQUOTE', 5, 40)],
    { AAPL: { price: 110, change: 1 }, NOCOST: { price: 50, change: 0 } }
  )
  const totals = computeTotals(valued)
  near(totals.marketValue, 1100 + 100 + 200)
  near(totals.gain, 100) // only AAPL is measurable
  near(totals.gainPct, 0.1) // against AAPL's cost alone, not the whole book
  near(totals.costBasis, 1000 + 200)
  assert.deepEqual(totals.unpriced, ['NOQUOTE'])
  assert.deepEqual(totals.uncosted, ['NOCOST'])
})

test('an empty portfolio produces zeroed totals', () => {
  const totals = computeTotals(valueHoldings([], {}))
  assert.equal(totals.marketValue, 0)
  assert.equal(totals.gainPct, null)
  assert.equal(totals.dayChangePct, null)
})

test('history values holdings on each day that has closes', () => {
  const holdings = [holding('AAPL', 10, 100, '2026-01-05'), holding('KO', 20, 60, '2026-01-05')]
  const points = buildHistory(holdings, [
    { ticker: 'AAPL', date: '2026-01-06', close: 110 },
    { ticker: 'KO', date: '2026-01-06', close: 61 },
    { ticker: 'KO', date: '2026-01-05', close: 60 },
    { ticker: 'AAPL', date: '2026-01-05', close: 105 },
  ])
  assert.deepEqual(points.map((p) => p.date), ['2026-01-05', '2026-01-06'])
  near(points[0].marketValue, 1050 + 1200)
  near(points[1].marketValue, 1100 + 1220)
  near(points[0].costBasis, 1000 + 1200)
})

test('history counts a holding only from the day it was opened', () => {
  const holdings = [holding('AAPL', 10, 100, '2026-01-05'), holding('KO', 20, 60, '2026-01-07')]
  const points = buildHistory(holdings, [
    { ticker: 'AAPL', date: '2026-01-06', close: 110 },
    { ticker: 'AAPL', date: '2026-01-07', close: 111 },
    { ticker: 'KO', date: '2026-01-07', close: 61 },
  ])
  assert.equal(points.length, 2)
  near(points[0].marketValue, 1100) // KO not open yet, and not required
  near(points[0].costBasis, 1000)
  near(points[1].marketValue, 1110 + 1220)
  near(points[1].costBasis, 1000 + 1200)
})

test('history skips a day when any open holding is missing a close', () => {
  const holdings = [holding('AAPL', 10, 100), holding('KO', 20, 60)]
  const points = buildHistory(holdings, [
    { ticker: 'AAPL', date: '2026-01-06', close: 110 },
    { ticker: 'AAPL', date: '2026-01-07', close: 111 },
    { ticker: 'KO', date: '2026-01-07', close: 61 },
  ])
  assert.deepEqual(points.map((p) => p.date), ['2026-01-07'])
})

test('history ignores days before anything was opened and closes for tickers not held', () => {
  const points = buildHistory([holding('AAPL', 10, 100, '2026-02-01')], [
    { ticker: 'AAPL', date: '2026-01-15', close: 90 },
    { ticker: 'MSFT', date: '2026-02-02', close: 400 },
    { ticker: 'AAPL', date: '2026-02-02', close: 120 },
  ])
  assert.deepEqual(points, [{ date: '2026-02-02', marketValue: 1200, costBasis: 1000 }])
})

test('history is empty with no holdings or no closes', () => {
  assert.deepEqual(buildHistory([], [{ ticker: 'AAPL', date: '2026-01-06', close: 1 }]), [])
  assert.deepEqual(buildHistory([holding('AAPL', 1, 1)], []), [])
})

test('a holding is priced by its key when it has one, so same-named assets stay apart', () => {
  const holdings = [
    { id: 'coin', ticker: 'BTC', key: 'CRYPTO:BTC', quantity: 0.5, costBasis: 60000, openedAt: '2026-01-02' },
    { id: 'fund', ticker: 'BTC', quantity: 10, costBasis: 40, openedAt: '2026-01-02' },
  ]
  const valued = valueHoldings(holdings, { 'CRYPTO:BTC': { price: 70000, change: -1000 }, BTC: { price: 45, change: 1 } })
  const coin = valued.find((h) => h.id === 'coin')
  const fund = valued.find((h) => h.id === 'fund')
  assert.equal(coin.marketValue, 35000)
  assert.equal(coin.dayChange, -500)
  assert.equal(fund.marketValue, 450)
  const history = buildHistory(holdings, [
    { ticker: 'CRYPTO:BTC', date: '2026-01-05', close: 68000 },
    { ticker: 'BTC', date: '2026-01-05', close: 44 },
  ])
  assert.deepEqual(history.map((p) => p.marketValue), [34000 + 440])
})

test('a quote with no change on record gives no day change, and totals treat it as unchanged', () => {
  const valued = valueHoldings(
    [
      { id: 'g', ticker: 'XAU', key: 'METAL:XAU', quantity: 2, costBasis: 3000, openedAt: '2026-01-02' },
      { id: 's', ticker: 'MSFT', quantity: 1, costBasis: 400, openedAt: '2026-01-02' },
    ],
    { 'METAL:XAU': { price: 3900, change: null }, MSFT: { price: 450, change: 5 } }
  )
  assert.equal(valued.find((h) => h.id === 'g').dayChange, null)
  const totals = computeTotals(valued)
  assert.equal(totals.dayChange, 5)
  assert.equal(totals.marketValue, 7800 + 450)
})

test('selling part of a holding', async () => {
  const { planSale } = await import('./portfolio.ts')
  const out = planSale({ quantity: 28, costBasis: 412.5 }, 10, 450)
  assert.equal(out.proceeds, 4500)
  assert.equal(out.remaining, 18)
  assert.equal(out.sellsAll, false)
  assert.equal(out.realizedGain, 375)
})

test('selling all of it, and selling more than is held', async () => {
  const { planSale } = await import('./portfolio.ts')
  // 0.1 + 0.2 is a hair over 0.3; the sale is capped at what is actually held.
  assert.deepEqual(planSale({ quantity: 0.3, costBasis: 100 }, 0.1 + 0.2, 120), { proceeds: 36, remaining: 0, sellsAll: true, realizedGain: 6 })
  const capped = planSale({ quantity: 5, costBasis: 10 }, 8, 12)
  assert.equal(capped.proceeds, 60)
  assert.equal(capped.sellsAll, true)
})

test('a sale with no cost on record has no gain to report', async () => {
  const { planSale } = await import('./portfolio.ts')
  assert.equal(planSale({ quantity: 2, costBasis: null }, 1, 3900).realizedGain, null)
})

test('buying more averages the cost by quantity', async () => {
  const { planBuy } = await import('./portfolio.ts')
  const out = planBuy({ quantity: 10, costBasis: 100 }, 10, 200)
  assert.equal(out.cost, 2000)
  assert.equal(out.quantity, 20)
  assert.equal(out.costBasis, 150)
  // 30 at $50 plus 10 at $90 is $2,400 for 40: $60 each.
  assert.equal(planBuy({ quantity: 30, costBasis: 50 }, 10, 90).costBasis, 60)
})

test('without the old cost, the new average is unknown, not invented', async () => {
  const { planBuy } = await import('./portfolio.ts')
  assert.equal(planBuy({ quantity: 2, costBasis: null }, 1, 3900).costBasis, null)
})

test('cash covers a cost exactly, but not a cent more', async () => {
  const { cashCovers } = await import('./portfolio.ts')
  assert.equal(cashCovers(1000, 1000), true)
  assert.equal(cashCovers(1000, 1000.004), true)
  assert.equal(cashCovers(1000, 1000.01), false)
})

test('with history, each day counts what was held then, including cash and since-sold assets', async () => {
  const { buildHistory } = await import('./portfolio.ts')
  const steps = {
    MSFT: [
      { date: '2026-02-03', quantity: 28, costBasis: 400 },
      { date: '2026-11-12', quantity: 30, costBasis: 408 },
      { date: '2026-11-13', quantity: 20, costBasis: 408 },
    ],
    KO: [
      { date: '2026-03-01', quantity: 10, costBasis: 60 },
      { date: '2026-11-12', quantity: 0, costBasis: null },
    ],
    'CASH:USD': [{ date: '2026-11-13', quantity: 5300, costBasis: null }],
  }
  const on = (key, date) => [...(steps[key] ?? [])].reverse().find((s) => s.date <= date) ?? null
  const closes = [
    ['2026-11-11', 'MSFT', 500], ['2026-11-11', 'KO', 70],
    ['2026-11-12', 'MSFT', 520], ['2026-11-12', 'KO', 71],
    ['2026-11-13', 'MSFT', 530],
  ].map(([date, ticker, close]) => ({ date, ticker, close }))
  const points = buildHistory([holding('MSFT', 20, 408, '2026-02-03')], closes, { keys: Object.keys(steps), on })
  assert.deepEqual(points.map((p) => [p.date, p.marketValue]), [
    ['2026-11-11', 28 * 500 + 10 * 70], // KO, sold since, still counts while held
    ['2026-11-12', 30 * 520], // bought 2 MSFT, sold all KO
    ['2026-11-13', 20 * 530 + 5300], // sold 10 MSFT into cash, worth a dollar each
  ])
  assert.equal(points[0].costBasis, 28 * 400 + 10 * 60)
  assert.equal(points[2].costBasis, 20 * 408) // cash has no cost
})

test('unitsForMoney: an amount of money becomes shares or coins at the price', async () => {
  const { unitsForMoney } = await import('./portfolio.ts')
  assert.equal(unitsForMoney(500, 1, 65000), 0.00769231, 'US$500 of bitcoin at US$65,000')
  assert.equal(unitsForMoney(1000, 1, 250), 4, 'whole shares when it divides evenly')
  near(unitsForMoney(1350, 1.35, 100), 10, 'S$1,350 at 1.35 to the dollar is US$1,000: 10 at US$100')
  assert.equal(unitsForMoney(0, 1, 100), null, 'nothing spent')
  assert.equal(unitsForMoney(100, 1, 0), null, 'no price')
  assert.equal(unitsForMoney(100, 0, 100), null, 'no exchange rate')
  assert.equal(unitsForMoney(0.000001, 1, 1e9), null, 'too little to buy any')
})
