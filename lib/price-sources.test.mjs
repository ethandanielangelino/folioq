// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { believable, directExchanges, midPrice, namesList, sourceLabel } from './price-sources.ts'

test('midPrice: the middle of a close bid and offer, nothing from a wide or broken one', () => {
  assert.equal(midPrice(84230.98, 84366.09), (84230.98 + 84366.09) / 2, 'Independent Reserve BTC/SGD')
  assert.equal(midPrice(284058, 292601), null, 'a 3% spread (thin ETH/JPY market) is not trusted')
  assert.equal(midPrice(0, 100), null, 'no bid')
  assert.equal(midPrice(100, 0), null, 'no offer')
  assert.equal(midPrice(101, 100), null, 'offer below bid')
  assert.equal(midPrice(100, 102), 101, 'exactly 2% apart is still fine')
})

test('believable: within 5% of the US-dollar price converted', () => {
  assert.equal(believable(84298, 84176), true, 'a 0.15% premium')
  assert.equal(believable(88000, 84000), true, 'under 5%')
  assert.equal(believable(90000, 84000), false, 'over 5% is doubted')
  assert.equal(believable(0, 84000), false)
  assert.equal(believable(84000, 0), false)
})

test('directExchanges: which exchanges quote crypto in a currency', () => {
  assert.deepEqual(directExchanges('SGD').map((s) => s.name), ['Independent Reserve'])
  assert.deepEqual(directExchanges('EUR').map((s) => s.name), ['Coinbase', 'Kraken'])
  assert.deepEqual(directExchanges('USD'), [], 'US dollars are the base, not a direct quote')
  assert.deepEqual(directExchanges('THB'), [], 'no exchange for baht')
})

test('labels name the source and, when quoted directly, the pair', () => {
  assert.equal(sourceLabel({ name: 'Independent Reserve', url: 'x', pair: 'BTC/SGD' }), 'Independent Reserve (BTC/SGD)')
  assert.equal(sourceLabel({ name: 'Coinbase', url: 'x' }), 'Coinbase')
  assert.equal(namesList(['Coinbase', 'Kraken']), 'Coinbase or Kraken')
  assert.equal(namesList(['A', 'B', 'C']), 'A, B, or C')
  assert.equal(namesList(['A', 'A']), 'A')
})
