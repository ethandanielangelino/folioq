import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeShareCode, timeLeft } from './sharing.ts'

test('share IDs are accepted however they are typed', () => {
  assert.equal(normalizeShareCode('FQ-7K3M-9X2P'), 'FQ-7K3M-9X2P')
  assert.equal(normalizeShareCode(' fq-7k3m-9x2p '), 'FQ-7K3M-9X2P')
  assert.equal(normalizeShareCode('fq7k3m9x2p'), 'FQ-7K3M-9X2P')
  assert.equal(normalizeShareCode('7K3M 9X2P'), 'FQ-7K3M-9X2P')
})

test('things that cannot be a share ID are rejected', () => {
  for (const input of ['', 'hello', 'FQ-7K3M', 'FQ-7K3M-9X2P-AAAA', 'FQ-0O1I-LLLL', 'someone@example.com']) {
    assert.equal(normalizeShareCode(input), null, input)
  }
})

test('time left on an invite reads naturally', () => {
  const now = Date.parse('2026-11-12T12:00:00Z')
  const inHours = (h) => new Date(now + h * 3_600_000).toISOString()
  assert.equal(timeLeft(inHours(168), now), '7 days')
  assert.equal(timeLeft(inHours(167.9), now), '7 days')
  assert.equal(timeLeft(inHours(30), now), '2 days')
  assert.equal(timeLeft(inHours(5), now), 'less than a day')
  assert.equal(timeLeft(inHours(-1), now), 'no time')
  assert.equal(timeLeft(null, now), '')
})
