import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeRate, isCurrency, money, moneyCompact, moneySigned, pickRate, USD } from './currency.ts'

const SGD = { code: 'SGD', rate: 1.2852 }
const JPY = { code: 'JPY', rate: 159.72 }
const EUR = { code: 'EUR', rate: 0.9016 }

test('US dollars are the default and unchanged', () => {
  assert.equal(money(1204.1), '$1,204.10')
  assert.equal(money(1204.1, USD), '$1,204.10')
  assert.equal(moneySigned(-88), '−$88.00')
  assert.equal(moneySigned(0.001), '$0.00')
  assert.equal(money(-0.001), '$0.00')
})

test('amounts are converted at the rate and labelled with their currency', () => {
  // A non-breaking space keeps the code and the figure on one line.
  assert.equal(money(1000, SGD), 'SGD\u00a01,285.20')
  assert.equal(money(1000, EUR), '€901.60')
  assert.equal(moneySigned(100, EUR), '+€90.16')
  assert.equal(moneySigned(-100, EUR), '−€90.16')
})

test('currencies quoted without decimals drop them', () => {
  assert.equal(money(1000, JPY), '¥159,720')
  assert.equal(money(10.004, JPY), '¥1,598')
})

test('compact amounts convert too', () => {
  assert.equal(moneyCompact(3_400_000_000, USD), '$3.4B')
  assert.equal(moneyCompact(1_000_000, EUR), '€901.6K')
})

test('the rate reads as a sentence', () => {
  assert.equal(describeRate(SGD), '1 USD = 1.2852 SGD')
  assert.equal(describeRate(JPY), '1 USD = 159.72 JPY')
})

test('only listed currencies are accepted', () => {
  assert.equal(isCurrency('SGD'), true)
  assert.equal(isCurrency('usd'), false)
  assert.equal(isCurrency('XYZ'), false)
  assert.equal(isCurrency(undefined), false)
})

test('a live rate is used when it agrees with the central bank', () => {
  assert.deepEqual(pickRate(1.2852, 1.2826), { rate: 1.2852, source: 'live' })
})

test('a live rate that is far from the central bank is ignored', () => {
  assert.deepEqual(pickRate(12.852, 1.2826), { rate: 1.2826, source: 'reference' })
  assert.deepEqual(pickRate(0, 1.2826), { rate: 1.2826, source: 'reference' })
  assert.deepEqual(pickRate(Number.NaN, 1.2826), { rate: 1.2826, source: 'reference' })
})

test('either source alone will do, and neither means no rate', () => {
  assert.deepEqual(pickRate(null, 1.2826), { rate: 1.2826, source: 'reference' })
  assert.deepEqual(pickRate(1.2852, null), { rate: 1.2852, source: 'live' })
  assert.equal(pickRate(null, undefined), null)
})
