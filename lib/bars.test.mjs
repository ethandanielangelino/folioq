import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  barAt,
  barDate,
  parseBitfinex,
  parseCoinbase,
  parseGate,
  parseIndependentReserve,
  parseKrakenTrades,
  parseKucoin,
  parseMsOhlc,
  parseUpbit,
  parseYahooBars,
  yahooIntervals,
} from './bars.ts'

const T = Date.UTC(2026, 2, 15, 8, 30) / 1000

test('the price at a moment is the close of the bar it falls in', () => {
  const bars = [
    { start: T - 60, seconds: 60, open: 1, high: 2, low: 1, close: 1.5 },
    { start: T, seconds: 60, open: 2, high: 3, low: 2, close: 2.5 },
    { start: T + 60, seconds: 60, open: 3, high: 4, low: 3, close: 3.5 },
  ]
  const found = barAt(bars, T + 20, 3600)
  assert.equal(found.bar.close, 2.5)
  assert.equal(found.inside, true)
})

test('when nothing traded at the moment, the last bar before it is used, and it says so', () => {
  const bars = [{ start: T - 600, seconds: 60, open: 1, high: 1, low: 1, close: 1 }]
  const found = barAt(bars, T, 3600)
  assert.equal(found.bar.close, 1)
  assert.equal(found.inside, false)
})

test('bars after the moment are never used, even the one in progress now', () => {
  const bars = [{ start: T + 60, seconds: 60, open: 9, high: 9, low: 9, close: 9 }]
  assert.equal(barAt(bars, T, 3600), null)
})

test('a bar older than the lookback is too far away to count', () => {
  const bars = [{ start: T - 7200, seconds: 60, open: 1, high: 1, low: 1, close: 1 }]
  assert.equal(barAt(bars, T, 3600), null)
})

test('Yahoo keeps minutes for 30 days, 5 minutes for 60, hours for two years, then only days', () => {
  const now = T + 86_400
  assert.deepEqual(yahooIntervals(T, now).map((i) => i.interval), ['1m', '5m', '60m'])
  assert.deepEqual(yahooIntervals(T, T + 40 * 86_400).map((i) => i.interval), ['5m', '60m'])
  assert.deepEqual(yahooIntervals(T, T + 400 * 86_400).map((i) => i.interval), ['60m'])
  assert.deepEqual(yahooIntervals(T, T + 900 * 86_400), [])
})

test('a daily bar belongs to the day at its middle, whatever time zone it starts in', () => {
  // Upbit's days start at 00:00 UTC; a market's day starting at 15:00 UTC the day before is the next day.
  assert.equal(barDate({ start: Date.UTC(2026, 2, 15) / 1000, seconds: 86_400, open: 1, high: 1, low: 1, close: 1 }), '2026-03-15')
  assert.equal(barDate({ start: Date.UTC(2026, 2, 14, 15) / 1000, seconds: 86_400, open: 1, high: 1, low: 1, close: 1 }), '2026-03-15')
})

test('each source’s columns are read in its own order', () => {
  // Coinbase: [time, low, high, open, close, volume]
  assert.deepEqual(parseCoinbase([[T, 10, 30, 15, 20, 1]], 60)[0], { start: T, seconds: 60, open: 15, high: 30, low: 10, close: 20 })
  // Binance and friends: [ms, open, high, low, close]
  assert.deepEqual(parseMsOhlc([[T * 1000, '15', '30', '10', '20']], 60)[0], { start: T, seconds: 60, open: 15, high: 30, low: 10, close: 20 })
  // KuCoin: [s, open, close, high, low]
  assert.deepEqual(parseKucoin({ data: [[String(T), '15', '20', '30', '10']] }, 60)[0], { start: T, seconds: 60, open: 15, high: 30, low: 10, close: 20 })
  // Gate: [s, quote volume, close, high, low, open]
  assert.deepEqual(parseGate([[String(T), '999', '20', '30', '10', '15']], 60)[0], { start: T, seconds: 60, open: 15, high: 30, low: 10, close: 20 })
  // Bitfinex: [ms, open, close, high, low]
  assert.deepEqual(parseBitfinex([[T * 1000, 15, 20, 30, 10, 1]], 60)[0], { start: T, seconds: 60, open: 15, high: 30, low: 10, close: 20 })
  // Upbit and Bithumb: UTC times without a zone
  assert.equal(
    parseUpbit([{ candle_date_time_utc: '2026-03-15T08:30:00', opening_price: 15, high_price: 30, low_price: 10, trade_price: 20 }], 60)[0].start,
    T
  )
})

test('Kraken’s trades become one-minute bars', () => {
  const body = { result: { XXBTZUSD: [['100', '1', T + 1], ['105', '1', T + 30], ['98', '1', T + 59], ['110', '1', T + 61]], last: '1' } }
  const bars = parseKrakenTrades(body)
  assert.equal(bars.length, 2)
  assert.deepEqual(bars[0], { start: T, seconds: 60, open: 100, high: 105, low: 98, close: 98 })
  assert.equal(bars[1].close, 110)
})

test('Independent Reserve hours with no trades carry no price', () => {
  const bars = parseIndependentReserve({
    HistorySummaryItems: [
      { StartTimestampUtc: '2026-03-15T08:00:00Z', NumberOfTrades: 0, ClosingSecondaryCurrencyPrice: 0 },
      { StartTimestampUtc: '2026-03-15T09:00:00Z', NumberOfTrades: 3, OpeningSecondaryCurrencyPrice: 5, HighestSecondaryCurrencyPrice: 6, LowestSecondaryCurrencyPrice: 4, ClosingSecondaryCurrencyPrice: 5.5 },
    ],
  })
  assert.equal(bars.length, 1)
  assert.equal(bars[0].close, 5.5)
})

test('Yahoo’s chart gives bars and the currency they are in; gaps are skipped', () => {
  const body = {
    chart: {
      result: [
        {
          meta: { currency: 'SGD' },
          timestamp: [T, T + 60],
          indicators: { quote: [{ open: [1, null], high: [2, null], low: [0.5, null], close: [1.5, null] }] },
        },
      ],
    },
  }
  const { bars, currency } = parseYahooBars(body, 60)
  assert.equal(currency, 'SGD')
  assert.equal(bars.length, 1)
  assert.equal(bars[0].close, 1.5)
})

test('nonsense answers give no bars rather than throwing', () => {
  for (const body of [null, undefined, {}, 'error', [['x']], { data: 'no' }]) {
    assert.deepEqual(parseCoinbase(body, 60), [])
    assert.deepEqual(parseMsOhlc(body, 60), [])
    assert.deepEqual(parseKrakenTrades(body), [])
    assert.deepEqual(parseYahooBars(body, 60).bars, [])
  }
})
