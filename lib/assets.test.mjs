import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedGroups, assetLabel, groupLabel, guessFundGroup, kindOf, listingTypeOf, normalizeAssetSymbol, priceKey, toAssetClass, unitName } from './assets.ts'

test('anything unknown counts as a stock, as every holding did before', () => {
  assert.equal(toAssetClass(undefined), 'stock')
  assert.equal(toAssetClass('nonsense'), 'stock')
  assert.equal(toAssetClass('crypto'), 'crypto')
})

test('ETF groupings are still listed tickers, priced the same way', () => {
  for (const c of ['stock', 'bond', 'property', 'commodity']) assert.equal(kindOf(c), 'listed')
  assert.equal(priceKey('BND', 'bond'), 'BND')
  assert.equal(priceKey('BND', 'stock'), 'BND')
})

test('crypto, metals and cash are kept apart from listed tickers', () => {
  assert.equal(priceKey('BTC', 'crypto'), 'CRYPTO:BTC')
  assert.equal(priceKey('BTC', 'stock'), 'BTC')
  assert.equal(priceKey('XAU', 'metal'), 'METAL:XAU')
  assert.equal(priceKey('SGD', 'cash'), 'CASH:SGD')
})

test('gold held directly and a gold fund are shown in their own groups', () => {
  assert.equal(groupLabel('metal'), 'Gold & silver')
  assert.equal(groupLabel('commodity'), 'Commodity funds')
  assert.equal(groupLabel('bond'), 'Bonds')
  assert.equal(groupLabel('cash'), 'Cash')
})

test('units read naturally', () => {
  assert.equal(unitName('stock', 1), 'share')
  assert.equal(unitName('crypto'), 'coins')
  assert.equal(unitName('metal', 1), 'troy ounce')
  assert.equal(unitName('cash'), '')
})

test('symbols are checked against what each kind allows', () => {
  assert.equal(normalizeAssetSymbol(' btc ', 'crypto'), 'BTC')
  assert.equal(normalizeAssetSymbol('bitcoin!', 'crypto'), null)
  assert.equal(normalizeAssetSymbol('xau', 'metal'), 'XAU')
  assert.equal(normalizeAssetSymbol('XPT', 'metal'), null)
  assert.equal(normalizeAssetSymbol('sgd', 'cash'), 'SGD')
  assert.equal(normalizeAssetSymbol('brk.b', 'stock'), 'BRK.B')
})

test('every kind of holding has its own label, and it always matches what it is', () => {
  assert.equal(assetLabel('stock', true), 'Stock')
  assert.equal(assetLabel('stock', false), 'Stock fund')
  assert.equal(assetLabel('bond', false), 'Bond fund')
  assert.equal(assetLabel('property', true), 'Property company')
  assert.equal(assetLabel('property', false), 'Property fund')
  assert.equal(assetLabel('commodity', false), 'Commodity fund')
  assert.equal(assetLabel('crypto', false), 'Crypto')
  assert.equal(assetLabel('metal', false), 'Precious metal')
  assert.equal(assetLabel('cash', false), 'Cash')
})

test('the exchange listing says whether a ticker is a company, a REIT, or a fund', () => {
  assert.equal(listingTypeOf('Common Stock'), 'company')
  assert.equal(listingTypeOf('ADR'), 'company')
  assert.equal(listingTypeOf('REIT'), 'reit')
  assert.equal(listingTypeOf('ETP'), 'fund')
  assert.equal(listingTypeOf('Closed-End Fund'), 'fund')
  assert.equal(listingTypeOf(''), 'unknown')
  assert.equal(listingTypeOf(null), 'unknown')
})

test('a company can only be a stock, a REIT only property, a fund any fund group', () => {
  assert.deepEqual(allowedGroups('company'), ['stock'])
  assert.deepEqual(allowedGroups('reit'), ['property'])
  assert.deepEqual(allowedGroups('fund'), ['stock', 'bond', 'property', 'commodity'])
  assert.deepEqual(allowedGroups('unknown'), ['stock', 'bond', 'property', 'commodity'])
})

test('a fund’s group is guessed from its name, without tripping on look-alike words', () => {
  assert.equal(guessFundGroup('VANGUARD TOTAL BOND MARKET'), 'bond')
  assert.equal(guessFundGroup('ISHARES 20+ YEAR TREASURY BOND ETF'), 'bond')
  assert.equal(guessFundGroup('VANGUARD REAL ESTATE ETF'), 'property')
  assert.equal(guessFundGroup('SPDR GOLD SHARES'), 'commodity')
  assert.equal(guessFundGroup('UNITED STATES OIL FUND LP'), 'commodity')
  assert.equal(guessFundGroup('SS SPDR S&P 500 ETF TRUST-US'), 'stock')
  // "Goldman" is not gold.
  assert.equal(guessFundGroup('GOLDMAN SACHS ACTIVEBETA US LARGE CAP'), 'stock')
})
