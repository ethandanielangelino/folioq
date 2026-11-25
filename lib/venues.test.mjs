import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CRYPTO_VENUES,
  STOCK_MARKETS,
  US_MARKET,
  cryptoVenue,
  isForeignListing,
  localTicker,
  marketOf,
  stockMarket,
  tickerOn,
  toVenueId,
  venueLabel,
  yahooSymbol,
} from './venues.ts'
import { CURRENCIES } from './currency.ts'

test('every exchange has a unique id that can be stored', () => {
  const ids = CRYPTO_VENUES.map((v) => v.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z0-9-]{2,40}$/)
})

test('an unknown or empty exchange means the automatic choice', () => {
  assert.equal(toVenueId(''), null)
  assert.equal(toVenueId(null), null)
  assert.equal(toVenueId('nonsense'), null)
  assert.equal(toVenueId('binance'), 'binance')
  assert.equal(cryptoVenue('upbit').quote, 'KRW')
})

test('every quote currency other than USDT is one FolioQ has a rate for', () => {
  const codes = new Set(CURRENCIES.map((c) => c.code))
  for (const v of CRYPTO_VENUES) if (v.quote !== 'USDT') assert.ok(codes.has(v.quote), v.id)
  for (const m of STOCK_MARKETS) assert.ok(codes.has(m.currency), m.id)
})

test('a share abroad is stored with its market suffix, added once', () => {
  const sgx = stockMarket('SGX')
  assert.equal(tickerOn('d05', sgx), 'D05.SI')
  assert.equal(tickerOn('D05.SI', sgx), 'D05.SI')
  assert.equal(tickerOn('aapl', US_MARKET), 'AAPL')
  assert.equal(localTicker('D05.SI'), 'D05')
  assert.equal(localTicker('AAPL'), 'AAPL')
})

test('the market is read back from the ticker; US share classes stay US', () => {
  assert.equal(marketOf('D05.SI').id, 'SGX')
  assert.equal(marketOf('0700.HK').id, 'HKEX')
  assert.equal(marketOf('BRK.B'), US_MARKET)
  assert.equal(marketOf('AAPL'), US_MARKET)
  assert.equal(isForeignListing('BARC.L'), true)
  assert.equal(isForeignListing('BRK.B'), false)
})

test('Yahoo symbols: US share classes take a dash, tickers abroad keep their suffix', () => {
  assert.equal(yahooSymbol('BRK.B'), 'BRK-B')
  assert.equal(yahooSymbol('D05.SI'), 'D05.SI')
  assert.equal(yahooSymbol('GC=F'), 'GC=F')
})

test('an exchange is named with its market', () => {
  assert.equal(venueLabel(cryptoVenue('binance'), 'BTC'), 'Binance (BTC/USDT)')
})

test('market suffixes are unique', () => {
  const suffixes = STOCK_MARKETS.map((m) => m.suffix).filter(Boolean)
  assert.equal(new Set(suffixes).size, suffixes.length)
})
