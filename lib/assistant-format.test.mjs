import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finalizeAnswer, formatSources, isNewsReport, splitSources, trustedPublisher } from './assistant-format.ts'

const market = { n: 1, kind: 'market', publisher: 'Finnhub', title: 'Live quotes, retrieved Nov 12, 2026', url: 'https://finnhub.io' }
const reuters = { n: 2, kind: 'news', publisher: 'Reuters', title: 'Microsoft lifts cloud forecast, Nov 10, 2026', url: 'https://example.com/a' }
const cnbc = { n: 3, kind: 'news', publisher: 'CNBC', title: 'Coca-Cola: prices hold <again>', url: 'https://example.com/b' }

test('only listed publishers are trusted, whatever the label looks like', () => {
  assert.equal(trustedPublisher('Reuters'), 'Reuters')
  assert.equal(trustedPublisher('DowJones'), 'Dow Jones Newswires')
  assert.equal(trustedPublisher('Yahoo'), null)
  assert.equal(trustedPublisher('SeekingAlpha'), null)
  assert.equal(trustedPublisher('Benzinga'), null)
  assert.equal(trustedPublisher('Reuters Fan Blog'), null)
  assert.equal(trustedPublisher(''), null)
})

test('a sources block survives being written and read back', () => {
  const saved = 'Answer text.' + formatSources([market, cnbc])
  const { body, sources } = splitSources(saved)
  assert.equal(body, 'Answer text.')
  assert.deepEqual(sources.map((s) => [s.n, s.publisher, s.url]), [
    [1, 'Finnhub', 'https://finnhub.io'],
    [3, 'CNBC', 'https://example.com/b'],
  ])
  assert.equal(sources[1].title, 'Coca-Cola: prices hold again')
})

test('an answer with no block, or a block the app did not write, is left whole', () => {
  assert.deepEqual(splitSources('Just text.'), { body: 'Just text.', sources: [] })
  const odd = 'Text.\n\nSources\nsome prose the owner pasted'
  assert.deepEqual(splitSources(odd), { body: odd, sources: [] })
})

test('citations are renumbered in order of use and listed at the end', () => {
  const out = finalizeAnswer('Cloud guidance rose [3]. MSFT is $12,742.80 of the fund [1].', [market, reuters, cnbc])
  const { body, sources } = splitSources(out)
  assert.equal(body, 'Cloud guidance rose. [1] MSFT is $12,742.80 of the fund. [2]')
  assert.deepEqual(sources.map((s) => [s.n, s.publisher]), [[1, 'CNBC'], [2, 'Finnhub']])
})

test('grouped citations are split so every source is listed', () => {
  const coinbase = { n: 4, kind: 'market', publisher: 'Coinbase', title: 'Crypto prices', url: 'https://exchange.coinbase.com' }
  const all = [market, reuters, cnbc, coinbase]
  for (const raw of ['Four kinds of asset [1, 2, 3, 4].', 'Four kinds of asset [1,2,3,4].', 'Four kinds of asset [1-4].', 'Four kinds of asset [1–4].']) {
    const { body, sources } = splitSources(finalizeAnswer(raw, all))
    assert.equal(body, 'Four kinds of asset. [1] [2] [3] [4]', raw)
    assert.deepEqual(sources.map((s) => s.publisher), ['Finnhub', 'Reuters', 'CNBC', 'Coinbase'], raw)
  }
})

test('citations to sources that were never offered are removed', () => {
  const out = finalizeAnswer('Rates will fall [7]. Concentration is a risk.', [market, reuters])
  assert.equal(out, 'Rates will fall. Concentration is a risk.')
})

test('figures bring the market-data source along even when uncited', () => {
  const { body, sources } = splitSources(finalizeAnswer('KO is 29.38% of the fund.', [market, reuters]))
  assert.equal(body, 'KO is 29.38% of the fund.')
  assert.deepEqual(sources.map((s) => s.publisher), ['Finnhub'])
})

test('an answer that used nothing from outside ends without a sources block', () => {
  const out = finalizeAnswer('Concentration risk means one position can dominate the result.', [market, reuters])
  assert.equal(splitSources(out).sources.length, 0)
  assert.ok(!out.includes('Sources'))
})

test('a source list the model wrote itself is replaced by the app’s', () => {
  const raw = 'Guidance rose [2].\n\n**Sources:**\n- [2] Some site I made up, http://bad.example'
  const out = finalizeAnswer(raw, [market, reuters])
  assert.ok(!out.includes('bad.example'))
  assert.deepEqual(splitSources(out).sources.map((s) => s.url), ['https://example.com/a'])
})

test('headlines that pitch a trade are not treated as news', () => {
  assert.equal(isNewsReport('Microsoft lifts cloud forecast after strong quarter'), true)
  assert.equal(isNewsReport('JPMorgan to buy back $30 billion of shares'), true)
  assert.equal(isNewsReport('AMD vs. Marvell: Which AI Stock Is a Better Buy Going into 2027?'), false)
  assert.equal(isNewsReport('Here’s What I’d Do With Microsoft Stock'), false)
  assert.equal(isNewsReport('3 Dividend Stocks to Buy Now'), false)
  assert.equal(isNewsReport('Analyst raises price target on Coca-Cola'), false)
})

test('amounts in another currency also bring the market-data source', () => {
  for (const text of ['The fund is worth SGD\u00a047,039.11.', 'MSFT is worth €13,159.20.', 'KO is worth ¥1,869,000.']) {
    assert.deepEqual(splitSources(finalizeAnswer(text, [market, reuters])).sources.map((s) => s.publisher), ['Finnhub'], text)
  }
})
