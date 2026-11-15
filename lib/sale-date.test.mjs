// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  closeOnOrBefore,
  isIsoDate,
  parseCoinbaseCandles,
  parseKrakenOhlc,
  parseYahooChart,
  saleDateProblem,
  shiftDate,
} from './sale-date.ts'

test('only real calendar dates count', () => {
  assert.equal(isIsoDate('2026-11-13'), true)
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('13/11/2026'), false)
  assert.equal(isIsoDate(''), false)
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
})

test('a sale can’t be in the future or before the holding was bought', () => {
  const rules = { openedAt: '2026-01-05', today: '2026-11-14' }
  assert.equal(saleDateProblem('2026-11-13', rules), null)
  assert.equal(saleDateProblem('2026-11-14', rules), null)
  assert.equal(saleDateProblem('2026-01-05', rules), null)
  assert.match(saleDateProblem('2026-11-15', rules), /future/)
  assert.match(saleDateProblem('2026-01-04', rules), /before you bought/)
  assert.match(saleDateProblem('', rules), /Choose the date/)
})

test('a weekend or holiday takes the last close before it, but not one from weeks earlier', () => {
  const points = [
    { date: '2026-11-11', close: 10 },
    { date: '2026-11-12', close: 11 },
    { date: '2026-11-13', close: 12 },
  ]
  assert.deepEqual(closeOnOrBefore(points, '2026-11-12'), { date: '2026-11-12', close: 11 })
  // Saturday: Friday's close.
  assert.deepEqual(closeOnOrBefore(points, '2026-11-14'), { date: '2026-11-13', close: 12 })
  // A close from after the sale date never counts.
  assert.equal(closeOnOrBefore([{ date: '2026-11-13', close: 12 }], '2026-11-12'), null)
  // A gap longer than any market closure means the data is missing.
  assert.equal(closeOnOrBefore(points, '2026-11-25'), null)
})

test('Yahoo’s timestamps become trading days in New York time', () => {
  const body = {
    chart: {
      result: [
        {
          meta: { gmtoffset: -18000 },
          // 9:30 New York on Nov 12 and 13 2026; null closes are skipped.
          timestamp: [1794493800, 1794580200, 1794666600],
          indicators: { quote: [{ close: [589.83, 592.94, null] }] },
        },
      ],
    },
  }
  assert.deepEqual(parseYahooChart(body), [
    { date: '2026-11-12', close: 589.83 },
    { date: '2026-11-13', close: 592.94 },
  ])
  assert.deepEqual(parseYahooChart({ chart: { result: null } }), [])
})

test('Coinbase and Kraken candles give each UTC day’s close', () => {
  assert.deepEqual(parseCoinbaseCandles([[1794441600, 71008, 74123.71, 73927.63, 71369.9, 10490.8]]), [
    { date: '2026-11-12', close: 71369.9 },
  ])
  assert.deepEqual(parseCoinbaseCandles({ message: 'NotFound' }), [])
  assert.deepEqual(
    parseKrakenOhlc({ error: [], result: { XXBTZUSD: [[1794441600, '1', '2', '0.5', '68201.7', '1', '1', 1]], last: 1794441600 } }),
    [{ date: '2026-11-12', close: 68201.7 }]
  )
  assert.deepEqual(parseKrakenOhlc({ error: ['EQuery:Unknown asset pair'] }), [])
})
