import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isValidEmail, passwordError, passwordProblems } from './credentials.ts'

test('a password must have all five things', () => {
  assert.deepEqual(passwordProblems('Correct-horse7').map((r) => r.id), [])
  assert.deepEqual(passwordProblems('Ab1!').map((r) => r.id), ['length'])
  assert.deepEqual(passwordProblems('correct-horse7').map((r) => r.id), ['upper'])
  assert.deepEqual(passwordProblems('CORRECT-HORSE7').map((r) => r.id), ['lower'])
  assert.deepEqual(passwordProblems('Correct-horse').map((r) => r.id), ['number'])
  assert.deepEqual(passwordProblems('Correcthorse7').map((r) => r.id), ['symbol'])
  assert.deepEqual(passwordProblems('').map((r) => r.id), ['length', 'lower', 'upper', 'number', 'symbol'])
})

test('a space does not count as a symbol', () => {
  assert.deepEqual(passwordProblems('Correct horse7').map((r) => r.id), ['symbol'])
})

test('the error names what is missing, and is null when nothing is', () => {
  assert.equal(passwordError('Correct-horse7'), null)
  assert.match(passwordError('correcthorse'), /a capital letter, a number, a symbol/)
})

test('well-formed email addresses are accepted', () => {
  for (const email of ['a@b.co', 'first.last@university.edu', 'name+tag@mail.example.sg', ' padded@example.com ']) {
    assert.equal(isValidEmail(email), true, email)
  }
})

test('malformed email addresses are rejected', () => {
  for (const email of [
    '', 'plain', '@example.com', 'name@', 'name@example', 'name@@example.com', 'na me@example.com',
    'name@example..com', '.name@example.com', 'name.@example.com', 'na..me@example.com',
    'name@-example.com', 'name@example.c', 'name@example.123', 'name@exa_mple.com',
  ]) {
    assert.equal(isValidEmail(email), false, email)
  }
})
