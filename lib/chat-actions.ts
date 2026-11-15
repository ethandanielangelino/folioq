// Changes the assistant sets up in a chat for the owner to confirm: adding a
// holding, buying more, selling, moving cash, removing a holding.
//
// The assistant never changes anything itself. It proposes; FolioQ shows the
// proposal in the chat as a form that asks for whatever is missing; the owner
// confirms; the same server actions as the dialogs then do the work.
//
// A proposal is saved inside the assistant's message, after its text and
// before its sources, on one line the app writes (never the model):
//
//   ⟦folioq:action⟧{"id":"…","type":"buy",…}
//
// What became of it is saved as a message of its own:
//
//   ⟦folioq:outcome <id> done⟧ Bought 0.5 BTC for SGD 42,195.00
//
// Pure functions with no imports, so they run in the browser, on the server,
// and under plain `node --test`.

export type HowGot = 'bought' | 'owned'
export type Amount = { amount: number; currency: string }

export type ChatAction =
  | {
      id: string
      type: 'add'
      /** What kind of thing; unset when the owner didn't say. */
      kind?: 'listed' | 'crypto' | 'metal'
      ticker?: string
      how?: HowGot
      quantity?: number
      /** For a purchase entered as money spent. */
      spend?: Amount
      /** Average cost per unit, for something already owned. */
      cost?: Amount
      date?: string
      /** A cash currency to pay from, or '' for money from outside FolioQ. */
      payFrom?: string
    }
  | {
      id: string
      type: 'buy'
      holdingId: string
      ticker: string
      quantity?: number
      spend?: Amount
      date?: string
      payFrom?: string
    }
  | {
      id: string
      type: 'sell'
      holdingId: string
      ticker: string
      quantity?: number
      all?: boolean
      date?: string
      /** The cash currency the money goes into. */
      into?: string
    }
  | { id: string; type: 'cash'; direction: 'in' | 'out'; currency?: string; amount?: number; date?: string }
  | { id: string; type: 'remove'; holdingId: string; ticker: string }

export type OutcomeStatus = 'done' | 'cancelled'
export interface Outcome {
  id: string
  status: OutcomeStatus
  /** What was recorded, in words ("Bought 0.5 BTC for SGD 42,195.00"). */
  summary: string
}

const ACTION = '⟦folioq:action⟧'
const SOURCES = '\n\nSources\n'
const OUTCOME = /^⟦folioq:outcome ([0-9a-f-]{36}) (done|cancelled)⟧ ?([\s\S]*)$/
const ID = /^[0-9a-f-]{36}$/

/** Removes anything that looks like one of the app's markers, so model text can never forge one. */
export function stripMarkers(text: string): string {
  return text.replace(/⟦folioq:[^⟧]*⟧/g, '')
}

/** Puts a proposal into a finished answer: after its text, before its sources. */
export function attachAction(content: string, action: ChatAction): string {
  const line = `\n\n${ACTION}${JSON.stringify(action)}`
  const at = content.lastIndexOf(SOURCES)
  return at === -1 ? `${content}${line}` : `${content.slice(0, at)}${line}${content.slice(at)}`
}

function isAction(value: unknown): value is ChatAction {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !ID.test(v.id)) return false
  if (v.type === 'add') return true
  if (v.type === 'cash') return v.direction === 'in' || v.direction === 'out'
  if (v.type === 'buy' || v.type === 'sell' || v.type === 'remove') {
    return typeof v.holdingId === 'string' && typeof v.ticker === 'string'
  }
  return false
}

/** Separates an answer's text (without its sources) from the proposal saved with it. */
export function splitAction(body: string): { text: string; action: ChatAction | null } {
  const at = body.lastIndexOf(ACTION)
  if (at === -1) return { text: body, action: null }
  try {
    const parsed: unknown = JSON.parse(body.slice(at + ACTION.length).trim())
    return { text: body.slice(0, at).trimEnd(), action: isAction(parsed) ? parsed : null }
  } catch {
    return { text: body.slice(0, at).trimEnd(), action: null }
  }
}

/** The message saved when a proposal was confirmed or cancelled. */
export function outcomeMessage(id: string, status: OutcomeStatus, summary: string): string {
  return `⟦folioq:outcome ${id} ${status}⟧ ${stripMarkers(summary).replace(/\s+/g, ' ').trim().slice(0, 400)}`
}

/** What a saved message says became of a proposal, or null if it isn't such a message. */
export function readOutcome(content: string): Outcome | null {
  const match = OUTCOME.exec(content.trim())
  return match ? { id: match[1], status: match[2] as OutcomeStatus, summary: match[3].trim() } : null
}

/** "Add a holding", "Buy more BTC", "Sell MSFT", "Add money", "Take money out", "Remove KO". */
export function actionTitle(action: ChatAction): string {
  switch (action.type) {
    case 'add':
      return action.ticker ? `Add ${action.ticker}` : 'Add a holding'
    case 'buy':
      return `Buy more ${action.ticker}`
    case 'sell':
      return `Sell ${action.ticker}`
    case 'cash':
      return action.direction === 'in' ? 'Add money' : 'Take money out'
    case 'remove':
      return `Remove ${action.ticker}`
  }
}
