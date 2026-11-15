// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashHistoryFor, historyFor, historyNotSetUp, saleGain, toHistoryEntry } from './history.ts'

let n = 0
const row = (fields) => ({
  id: `e${++n}`, asset_key: 'MSFT', ticker: 'MSFT', asset_class: 'stock', kind: 'bought', quantity: '2',
  price: '523.88', trade_date: '2026-11-12', cash_change: '0', created_at: `2026-11-14T10:00:0${n}Z`, ...fields,
})

test('rows become entries, with numbers as numbers and bad rows dropped', () => {
  const e = toHistoryEntry(row({ cost_basis: '412.5', price_date: '2026-11-12T00:00:00Z', before_history: true }))
  assert.equal(e.quantity, 2)
  assert.equal(e.price, 523.88)
  assert.equal(e.costBasis, 412.5)
  assert.equal(e.priceDate, '2026-11-12')
  assert.equal(e.beforeHistory, true)
  assert.equal(e.price === null, false)
  assert.equal(toHistoryEntry(row({ price: null })).price, null)
  assert.equal(toHistoryEntry(row({ kind: 'gifted' })), null)
  assert.equal(toHistoryEntry(row({ trade_date: null })), null)
})

test('one asset’s history, newest first; same day, latest recorded first', () => {
  const entries = [
    row({ trade_date: '2026-02-03', kind: 'opened' }),
    row({ trade_date: '2026-11-12', kind: 'bought' }),
    row({ trade_date: '2026-11-12', kind: 'sold' }),
    row({ asset_key: 'KO', ticker: 'KO' }),
  ].map(toHistoryEntry)
  assert.deepEqual(historyFor(entries, 'MSFT').map((e) => e.kind), ['sold', 'bought', 'opened'])
})

test('US dollar cash also shows money moved by trades; other currencies don’t', () => {
  const entries = [
    row({ asset_key: 'CASH:USD', ticker: 'USD', asset_class: 'cash', kind: 'opened', quantity: '5000', price: null, trade_date: '2026-04-01' }),
    row({ kind: 'sold', cash_change: '974.40' }),
    row({ kind: 'bought', cash_change: '0' }),
    row({ asset_key: 'CASH:SGD', ticker: 'SGD', asset_class: 'cash', kind: 'opened', quantity: '100', price: null }),
  ].map(toHistoryEntry)
  assert.deepEqual(cashHistoryFor(entries, 'USD').map((e) => `${e.assetKey} ${e.kind}`), ['MSFT sold', 'CASH:USD opened'])
  assert.deepEqual(cashHistoryFor(entries, 'SGD').map((e) => e.assetKey), ['CASH:SGD'])
})

test('a sale’s gain is against the average cost at the time', () => {
  assert.equal(saleGain(toHistoryEntry(row({ kind: 'sold', quantity: '10', price: '97.44', cost_basis: '68.2' }))).toFixed(2), '292.40')
  assert.equal(saleGain(toHistoryEntry(row({ kind: 'sold', cost_basis: null }))), null)
  assert.equal(saleGain(toHistoryEntry(row({ kind: 'bought', cost_basis: '1' }))), null)
})

test('a missing history table is recognised', () => {
  assert.equal(historyNotSetUp({ code: 'PGRST205', message: "Could not find the table 'public.holding_history'" }), true)
  assert.equal(historyNotSetUp({ code: '42P01' }), true)
  assert.equal(historyNotSetUp({ code: '42501', message: 'permission denied' }), false)
  assert.equal(historyNotSetUp(null), false)
})

test('replaying history gives what was held, and at what cost, on each day', async () => {
  const { positionTimeline, positionOn } = await import('./history.ts')
  const entries = [
    row({ kind: 'opened', quantity: '28', price: '400', trade_date: '2026-02-03', before_history: true }),
    row({ kind: 'bought', quantity: '2', price: '520', trade_date: '2026-11-12' }),
    row({ kind: 'sold', quantity: '10', price: '530', cost_basis: '408', trade_date: '2026-11-13', cash_change: '5300' }),
  ].map(toHistoryEntry)
  const t = positionTimeline(entries)
  assert.equal(positionOn(t.get('MSFT'), '2026-02-02'), null)
  assert.deepEqual(positionOn(t.get('MSFT'), '2026-06-01'), { date: '2026-02-03', quantity: 28, costBasis: 400 })
  const after = positionOn(t.get('MSFT'), '2026-11-12')
  assert.equal(after.quantity, 30)
  assert.equal(after.costBasis, 408) // (28 × 400 + 2 × 520) / 30
  assert.equal(positionOn(t.get('MSFT'), '2026-11-14').quantity, 20)
  // The sale's money shows up on US dollar cash from that day.
  assert.equal(positionOn(t.get('CASH:USD'), '2026-11-12'), null)
  assert.equal(positionOn(t.get('CASH:USD'), '2026-11-13').quantity, 5300)
})

test('deposits, withdrawals and purchases paid from another currency move that cash line', async () => {
  const { positionTimeline, positionOn } = await import('./history.ts')
  const cash = (fields) => row({ asset_key: 'CASH:SGD', ticker: 'SGD', asset_class: 'cash', price: null, ...fields })
  const entries = [
    cash({ kind: 'deposited', quantity: '5000', trade_date: '2026-10-01' }),
    cash({ kind: 'withdrawn', quantity: '1000', trade_date: '2026-10-05' }),
    row({ kind: 'bought', quantity: '1', price: '500', trade_date: '2026-10-10', cash_change: '-650', cash_currency: 'SGD' }),
  ].map(toHistoryEntry)
  const t = positionTimeline(entries)
  assert.equal(positionOn(t.get('CASH:SGD'), '2026-10-04').quantity, 5000)
  assert.equal(positionOn(t.get('CASH:SGD'), '2026-10-06').quantity, 4000)
  assert.equal(positionOn(t.get('CASH:SGD'), '2026-10-10').quantity, 3350)
  assert.equal(t.has('CASH:USD'), false)
})

test('a cash line’s history includes trades paid in its own currency only', () => {
  const entries = [
    row({ kind: 'bought', cash_change: '-650', cash_currency: 'SGD' }),
    row({ kind: 'sold', cash_change: '100' }),
  ].map(toHistoryEntry)
  assert.equal(cashHistoryFor(entries, 'SGD').length, 1)
  assert.equal(cashHistoryFor(entries, 'USD').length, 1)
})
