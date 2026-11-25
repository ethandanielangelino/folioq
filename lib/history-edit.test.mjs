// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PURPOSE_MAX, cleanPurpose, holdingAfterEdit, purposeWord, takesPurpose, isEditable, newestFirst, replayAsset, toHistoryEntry } from './history.ts'

let n = 0
const entry = (fields) =>
  toHistoryEntry({
    id: `e${++n}`,
    asset_key: 'MSFT',
    ticker: 'MSFT',
    asset_class: 'stock',
    kind: 'bought',
    quantity: '1',
    price: '100',
    trade_date: '2026-11-10',
    cash_change: '0',
    created_at: `2026-11-14T10:00:${String(n).padStart(2, '0')}Z`,
    ...fields,
  })

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)

test('replaying an asset gives what is held and its average cost', () => {
  const r = replayAsset([
    entry({ kind: 'opened', quantity: '10', price: '100', trade_date: '2026-11-01' }),
    entry({ kind: 'bought', quantity: '10', price: '200', trade_date: '2026-11-05' }),
    entry({ kind: 'sold', quantity: '5', price: '300', trade_date: '2026-11-08' }),
  ])
  close(r.quantity, 15)
  close(r.costBasis, 150) // sales don't change the average cost
  assert.equal(r.since, '2026-11-01')
  assert.equal(r.oversold, false)
})

test('a sale is measured against the average cost just before it', () => {
  const sale = entry({ kind: 'sold', quantity: '5', trade_date: '2026-11-08' })
  const r = replayAsset([
    entry({ kind: 'opened', quantity: '10', price: '100', trade_date: '2026-11-01' }),
    entry({ kind: 'bought', quantity: '10', price: '200', trade_date: '2026-11-05' }),
    sale,
  ])
  close(r.atSale.get(sale.id).costBasis, 150)
  close(r.atSale.get(sale.id).quantityBefore, 20)
})

test('moving a purchase after a sale it paid for shows the sale as more than was held', () => {
  const r = replayAsset([
    entry({ kind: 'opened', quantity: '2', trade_date: '2026-11-01' }),
    entry({ kind: 'bought', quantity: '5', trade_date: '2026-11-09' }),
    entry({ kind: 'sold', quantity: '6', trade_date: '2026-11-08' }),
  ])
  assert.equal(r.oversold, true)
})

test('entries on the same day follow the time given', () => {
  const buy = entry({ kind: 'bought', quantity: '1', trade_date: '2026-11-10', traded_at: '2026-11-10T15:00:00Z' })
  const sale = entry({ kind: 'sold', quantity: '1', trade_date: '2026-11-10', traded_at: '2026-11-10T09:00:00Z' })
  // The sale came first that day, so it is for more than was held then.
  assert.equal(replayAsset([buy, sale]).oversold, true)
  assert.equal(newestFirst([sale, buy])[0].id, buy.id)
})

test('an edit moves the holding by exactly what it changes', () => {
  const opened = entry({ kind: 'opened', quantity: '10', price: '100', trade_date: '2026-11-01' })
  const buy = entry({ kind: 'bought', quantity: '10', price: '200', trade_date: '2026-11-05' })
  const before = replayAsset([opened, buy])
  // Bought 5, not 10, at the same price.
  const after = replayAsset([opened, { ...buy, quantity: 5 }])
  const next = holdingAfterEdit({ quantity: 20, costBasis: 150 }, before, after)
  close(next.quantity, 15)
  close(next.costBasis, (10 * 100 + 5 * 200) / 15)
})

test('a holding whose history is incomplete still moves only by the edit', () => {
  // The holding has 3 more than the history knows of (bought before history was kept), at 100.
  const opened = entry({ kind: 'opened', quantity: '10', price: '100', trade_date: '2026-11-01' })
  const before = replayAsset([opened])
  const after = replayAsset([{ ...opened, quantity: 12 }])
  const next = holdingAfterEdit({ quantity: 13, costBasis: 100 }, before, after)
  close(next.quantity, 15)
  close(next.costBasis, 100)
})

test('an unknown average cost stays unknown', () => {
  const opened = entry({ kind: 'opened', quantity: '10', price: null, trade_date: '2026-11-01' })
  const before = replayAsset([opened])
  const after = replayAsset([{ ...opened, quantity: 4 }])
  assert.deepEqual(holdingAfterEdit({ quantity: 10, costBasis: null }, before, after), { quantity: 4, costBasis: null })
})

test('the start date follows the opening entry when it is moved', () => {
  const opened = entry({ kind: 'opened', quantity: '10', trade_date: '2026-11-01' })
  assert.equal(replayAsset([{ ...opened, tradeDate: '2026-10-20' }]).since, '2026-10-20')
})

test('only purchases, sales and opening entries can be edited', () => {
  assert.equal(isEditable(entry({ kind: 'bought' })), true)
  assert.equal(isEditable(entry({ kind: 'sold' })), true)
  assert.equal(isEditable(entry({ kind: 'opened' })), true)
  assert.equal(isEditable(entry({ kind: 'corrected' })), false)
  assert.equal(isEditable(entry({ kind: 'deposited' })), false)
})

test('an edited entry carries who edited it and how it read before', () => {
  const e = entry({
    edited_at: '2026-11-24T05:00:00Z',
    edited_name: 'Sam',
    revisions: [{ quantity: 3, price: 90, trade_date: '2026-11-09', traded_at: '2026-11-09T02:00:00Z' }],
  })
  assert.equal(e.editedName, 'Sam')
  assert.deepEqual(e.before, { quantity: 3, price: 90, tradeDate: '2026-11-09', tradedAt: '2026-11-09T02:00:00Z', purpose: null })
  assert.equal(entry({}).before, null)
})

test('money taken out keeps what it was for, tidied', () => {
  const e = entry({ kind: 'withdrawn', asset_key: 'CASH:SGD', ticker: 'SGD', asset_class: 'cash', purpose: '  School   fees ' })
  assert.equal(e.purpose, 'School fees')
  assert.equal(entry({ kind: 'withdrawn', purpose: '   ' }).purpose, null)
  assert.equal(entry({ kind: 'withdrawn' }).purpose, null)
})

test('a purpose is cut to its longest length, and anything but text is none', () => {
  assert.equal(cleanPurpose('x'.repeat(PURPOSE_MAX + 50)).length, PURPOSE_MAX)
  assert.equal(cleanPurpose('Rent\n for\tMay'), 'Rent for May')
  assert.equal(cleanPurpose(42), '')
  assert.equal(cleanPurpose(null), '')
})

test('the purpose before a change is kept with the earlier version', () => {
  const e = entry({ kind: 'withdrawn', purpose: 'Holiday', edited_at: '2026-11-25T05:00:00Z', edit_note: 'purpose', revisions: [{ quantity: 500, purpose: 'Bills' }] })
  assert.equal(e.before.purpose, 'Bills')
  assert.equal(e.editNote, 'purpose')
})

test('money added and money taken out can carry a note; trades and old balances can’t', () => {
  const cash = { asset_key: 'CASH:SGD', ticker: 'SGD', asset_class: 'cash' }
  assert.equal(takesPurpose(entry({ ...cash, kind: 'deposited' })), true)
  assert.equal(takesPurpose(entry({ ...cash, kind: 'withdrawn' })), true)
  assert.equal(takesPurpose(entry({ ...cash, kind: 'opened' })), true)
  assert.equal(takesPurpose(entry({ ...cash, kind: 'opened', before_history: true })), false)
  assert.equal(takesPurpose(entry({ ...cash, kind: 'corrected' })), false)
  assert.equal(takesPurpose(entry({ kind: 'bought' })), false)
  assert.equal(purposeWord('withdrawn'), 'For')
  assert.equal(purposeWord('deposited'), 'From')
})
