'use client'

import { useSyncExternalStore } from 'react'

// The assistant's answer in progress, kept outside the chat panel so it keeps
// arriving when the person moves to another page of the app. The panel shows
// it when it is on screen; the notice in the app frame shows it everywhere else.
// The server finishes and saves the answer even if nobody is listening, so a
// full reload loses only the live view of it, not the answer.

/** The route sends this as its last character when an answer broke off. */
const FAILED = '\u0000'
/** The route sends this before the finished answer, which replaces the draft shown so far. */
const FINAL = '\u0001'

/** What to show from the text received so far. */
function shown(received: string): string {
  const text = received.replace(FAILED, '')
  const at = text.lastIndexOf(FINAL)
  return at === -1 ? text : text.slice(at + 1)
}

/** How long a reloaded page waits for an answer it can no longer watch being written. */
export const WAIT_LIMIT_MS = 90_000

export interface Answer {
  portfolioId: string
  portfolioName: string
  /** The chat it belongs to; null when there is one conversation per portfolio. */
  chatId: string | null
  question: string
  /** The answer as received so far. */
  text: string
  /**
   * writing: arriving now. waiting: the page was reloaded while it was being
   * written, so it is being written out of sight and will appear once saved.
   * done: finished and saved. failed: it broke off; nothing was saved.
   */
  status: 'writing' | 'waiting' | 'done' | 'failed'
  error: string
  startedAt: number
  /** How many messages the chat had when asked, so the page can tell when the saved answer is in. */
  baseline: number
  /** A chat panel for this portfolio is on screen. */
  onScreen: boolean
}

type Started = Pick<Answer, 'portfolioId' | 'portfolioName' | 'chatId' | 'question' | 'baseline'>

const answers = new Map<string, Omit<Answer, 'onScreen'>>()
const watchers = new Map<string, number>()
const listeners = new Set<() => void>()
let snapshot: Answer[] = []
const none: Answer[] = []

function emit() {
  snapshot = [...answers.values()].map((a) => ({ ...a, onScreen: (watchers.get(a.portfolioId) ?? 0) > 0 }))
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// A note in this tab's session storage, so a reload knows an answer is still on its way.
const noteKey = (portfolioId: string) => `folioq:answering:${portfolioId}`

function remember(answer: Started & { startedAt: number }) {
  try {
    sessionStorage.setItem(noteKey(answer.portfolioId), JSON.stringify(answer))
  } catch {
    // storage blocked: a reload just won't show the answer until it is saved
  }
}

function forget(portfolioId: string) {
  try {
    sessionStorage.removeItem(noteKey(portfolioId))
  } catch {
    // nothing to remove
  }
}

function patch(portfolioId: string, startedAt: number, changes: Partial<Answer>) {
  const current = answers.get(portfolioId)
  // A newer question has replaced this one.
  if (!current || current.startedAt !== startedAt) return
  answers.set(portfolioId, { ...current, ...changes })
  emit()
}

export function isBusy(answer: Answer | null | undefined): boolean {
  return answer?.status === 'writing' || answer?.status === 'waiting'
}

/**
 * Sends the question and reads the answer as it arrives. Returns false if
 * this portfolio is already waiting for one.
 */
export function startAnswer(input: Started): boolean {
  const existing = answers.get(input.portfolioId)
  if (existing && (existing.status === 'writing' || existing.status === 'waiting')) return false
  const startedAt = Date.now()
  answers.set(input.portfolioId, { ...input, text: '', status: 'writing', error: '', startedAt })
  emit()
  remember({ ...input, startedAt })
  void read(input, startedAt)
  return true
}

async function read(input: Started, startedAt: number) {
  const fail = (error: string) => {
    forget(input.portfolioId)
    patch(input.portfolioId, startedAt, { status: 'failed', error })
  }
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        portfolioId: input.portfolioId,
        question: input.question,
        ...(input.chatId ? { chatId: input.chatId } : {}),
      }),
    })

    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return fail(body?.error ?? 'The assistant could not answer. Try again.')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let received = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += decoder.decode(value, { stream: true })
      patch(input.portfolioId, startedAt, { text: shown(received) })
    }

    if (received.includes(FAILED) || !shown(received).trim()) {
      return fail('The answer was cut off before it finished. Try again.')
    }
    forget(input.portfolioId)
    patch(input.portfolioId, startedAt, { status: 'done', text: shown(received) })
  } catch {
    fail('The connection dropped before the answer finished. Try again.')
  }
}

/**
 * After a reload: if this tab asked something here moments ago and the answer
 * hasn't been seen, wait for it out of sight. Ignored once it is too old.
 */
export function resumeAnswer(portfolioId: string) {
  if (answers.has(portfolioId)) return
  let note: (Started & { startedAt: number }) | null = null
  try {
    const raw = sessionStorage.getItem(noteKey(portfolioId))
    note = raw ? JSON.parse(raw) : null
  } catch {
    note = null
  }
  if (!note || typeof note.startedAt !== 'number' || Date.now() - note.startedAt > WAIT_LIMIT_MS) {
    forget(portfolioId)
    return
  }
  answers.set(portfolioId, { ...note, portfolioId, text: '', status: 'waiting', error: '' })
  emit()
}

/** The saved answer is showing (or it never will): stop tracking it. */
export function dismissAnswer(portfolioId: string) {
  forget(portfolioId)
  if (answers.delete(portfolioId)) emit()
}

/** Gives up on an answer being written out of sight. */
export function giveUpAnswer(portfolioId: string, error: string) {
  const current = answers.get(portfolioId)
  if (!current) return
  forget(portfolioId)
  patch(portfolioId, current.startedAt, { status: 'failed', error })
}

/** Marks a chat panel for this portfolio as on screen. Returns the function that unmarks it. */
export function watchAnswer(portfolioId: string): () => void {
  watchers.set(portfolioId, (watchers.get(portfolioId) ?? 0) + 1)
  emit()
  return () => {
    const left = (watchers.get(portfolioId) ?? 1) - 1
    if (left > 0) watchers.set(portfolioId, left)
    else watchers.delete(portfolioId)
    emit()
  }
}

/** Every answer being tracked. */
export function useAnswers(): Answer[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => none)
}

/** The answer being tracked for one portfolio, if any. */
export function useAnswer(portfolioId: string): Answer | null {
  return useAnswers().find((a) => a.portfolioId === portfolioId) ?? null
}
