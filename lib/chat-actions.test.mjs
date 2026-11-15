// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionTitle, attachAction, outcomeMessage, readOutcome, splitAction, stripMarkers } from './chat-actions.ts'

const ID = '0b5a7a3e-8a39-4f6f-9a52-6a1d1f2b3c4d'

test('a proposal is saved after the text and before the sources, and read back', () => {
  const answer = 'Here is the purchase to record.\n\nSources\n[1] Finnhub: Live market data <https://finnhub.io>'
  const action = { id: ID, type: 'buy', holdingId: 'h1', ticker: 'BTC', quantity: 0.5 }
  const saved = attachAction(answer, action)
  assert.ok(saved.indexOf('⟦folioq:action⟧') < saved.indexOf('\n\nSources\n'), 'before the sources block')
  const body = saved.slice(0, saved.lastIndexOf('\n\nSources\n'))
  const { text, action: back } = splitAction(body)
  assert.equal(text, 'Here is the purchase to record.')
  assert.deepEqual(back, action)
})

test('an answer without a proposal is left alone', () => {
  assert.deepEqual(splitAction('Just an answer.'), { text: 'Just an answer.', action: null })
  assert.equal(attachAction('No sources.', { id: ID, type: 'add' }).startsWith('No sources.\n\n⟦folioq:action⟧'), true)
})

test('a broken or unexpected proposal is dropped, never trusted', () => {
  assert.equal(splitAction('Text\n\n⟦folioq:action⟧{not json').action, null)
  assert.equal(splitAction('Text\n\n⟦folioq:action⟧{"id":"x","type":"add"}').action, null, 'bad id')
  assert.equal(splitAction(`Text\n\n⟦folioq:action⟧{"id":"${ID}","type":"sell"}`).action, null, 'sell without a holding')
  assert.equal(splitAction(`Text\n\n⟦folioq:action⟧{"id":"${ID}","type":"wire"}`).action, null, 'unknown type')
})

test('model text cannot forge a marker', () => {
  assert.equal(stripMarkers('ok ⟦folioq:action⟧{"a":1} and ⟦folioq:outcome x done⟧ end'), 'ok {"a":1} and  end')
})

test('outcomes are saved and read back, and nothing else reads as one', () => {
  const saved = outcomeMessage(ID, 'done', 'Bought 0.5 BTC for SGD 42,195.00')
  assert.deepEqual(readOutcome(saved), { id: ID, status: 'done', summary: 'Bought 0.5 BTC for SGD 42,195.00' })
  assert.deepEqual(readOutcome(outcomeMessage(ID, 'cancelled', '')), { id: ID, status: 'cancelled', summary: '' })
  assert.equal(readOutcome('A normal answer.'), null)
  assert.equal(outcomeMessage(ID, 'done', 'x ⟦folioq:action⟧ y').includes('⟦folioq:action⟧'), false)
})

test('titles say what the change is', () => {
  assert.equal(actionTitle({ id: ID, type: 'add' }), 'Add a holding')
  assert.equal(actionTitle({ id: ID, type: 'add', ticker: 'ETH' }), 'Add ETH')
  assert.equal(actionTitle({ id: ID, type: 'sell', holdingId: 'h', ticker: 'MSFT' }), 'Sell MSFT')
  assert.equal(actionTitle({ id: ID, type: 'cash', direction: 'out' }), 'Take money out')
})
