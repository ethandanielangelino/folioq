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
