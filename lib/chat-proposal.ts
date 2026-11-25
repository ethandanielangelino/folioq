// Server-only: turns what the model asked to set up (its record_change call)
// into a proposal the owner can check and confirm in the chat.
//
// Nothing the model says is trusted as is. Every field is checked and
// normalised here, the holding it refers to is looked up in the portfolio
// itself, and anything doubtful is simply left blank, so the form asks the
// owner for it. Saving still goes through the ordinary server actions, with
// their own checks, and only after the owner confirms.

import { randomUUID } from 'node:crypto'
import { METALS, kindOf, normalizeAssetSymbol, type AssetKind } from '@/lib/assets'
import type { Amount, ChatAction, HowGot } from '@/lib/chat-actions'
import { isCurrency } from '@/lib/currency'
import type { Holding } from '@/lib/data'
import { cleanPurpose } from '@/lib/history'

const ACTIONS = ['add_holding', 'buy', 'sell', 'add_money', 'take_money_out', 'remove_holding'] as const

/** The function the model may call. Gemini's schema format (an OpenAPI subset). */
export const RECORD_CHANGE = {
  name: 'record_change',
  description:
    'Set up a change to this portfolio for the owner to check and confirm in the chat. Call it whenever the owner asks to record or change something, even with no details at all: the form it opens asks for whatever is missing. Nothing is saved until they confirm. Give only details the owner actually stated. Never give a price: FolioQ looks prices up.',
  parameters: {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        enum: [...ACTIONS],
        description:
          'add_holding: something not yet in the portfolio. buy: more of a holding already in it. sell: some or all of a holding. add_money / take_money_out: cash in or out. remove_holding: delete a holding entered by mistake (not a sale).',
      },
      asset_type: { type: 'STRING', enum: ['stock_or_fund', 'crypto', 'gold_or_silver', 'cash'] },
      symbol: {
        type: 'STRING',
        description: 'Ticker (AAPL), coin symbol (BTC), XAU for gold, XAG for silver, or a currency code (SGD) for cash.',
      },
      how: { type: 'STRING', enum: ['just_bought', 'already_owned'], description: 'For add_holding only.' },
      quantity: { type: 'NUMBER', description: 'Number of shares, coins, or troy ounces.' },
      money_amount: {
        type: 'NUMBER',
        description: 'Money spent on a purchase, or the amount of cash added or taken out.',
      },
      money_currency: { type: 'STRING', description: 'Currency code of money_amount, e.g. SGD or USD.' },
      average_cost: { type: 'NUMBER', description: 'Average cost per unit, for something already owned.' },
      cost_currency: { type: 'STRING', description: 'Currency code of average_cost.' },
      date: { type: 'STRING', description: 'YYYY-MM-DD, when the owner said when it happened.' },
      pay_from_cash: {
        type: 'STRING',
        description: 'Currency code of the portfolio cash that paid for a purchase, or "outside" for money from outside the portfolio.',
      },
      into_cash: { type: 'STRING', description: 'Currency code of the portfolio cash a sale’s money goes into.' },
      sell_all: { type: 'BOOLEAN' },
      purpose: {
        type: 'STRING',
        description:
          'For add_money: where the money came from (e.g. "Salary", "Bonus"). For take_money_out: what it is for (e.g. "Rent", "School fees"). A few words, only if the owner said.',
      },
    },
    required: ['action'],
  },
} as const

const text = (value: unknown, max = 24): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : undefined
}

const positive = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e12 ? n : undefined
}

const currency = (value: unknown): string | undefined => {
  const code = text(value, 3)?.toUpperCase()
  return code && isCurrency(code) ? code : undefined
}

const day = (value: unknown, today: string): string | undefined => {
  const d = text(value, 10)
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && d <= today && d >= '1970-01-01'
    ? d
    : undefined
}

const amount = (value: unknown, code: unknown): Amount | undefined => {
  const n = positive(value)
  const c = currency(code)
  return n !== undefined && c ? { amount: n, currency: c } : undefined
}

const KINDS: Record<string, AssetKind> = {
  stock_or_fund: 'listed',
  crypto: 'crypto',
  gold_or_silver: 'metal',
  cash: 'cash',
}

/** "GOLD" and "XAU" are both gold. */
function symbolFor(raw: string | undefined, kind: AssetKind | undefined): string | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase()
  if (upper === 'GOLD') return 'XAU'
  if (upper === 'SILVER') return 'XAG'
  if (kind === 'cash') return isCurrency(upper) ? upper : undefined
  if (kind) return normalizeAssetSymbol(upper, kind === 'listed' ? 'stock' : kind) ?? undefined
  return /^[A-Z0-9.\-]{1,12}$/.test(upper) ? upper : undefined
}

/**
 * The proposal to show, or a note to add to the answer instead (selling
 * something that isn't held), or neither.
 */
export function proposalFrom(
  args: Record<string, unknown>,
  holdings: Holding[],
  today: string
): { action: ChatAction | null; note: string | null } {
  const name = typeof args.action === 'string' && (ACTIONS as readonly string[]).includes(args.action) ? args.action : null
  if (!name) return { action: null, note: null }
  const id = randomUUID()

  let kind = typeof args.asset_type === 'string' ? KINDS[args.asset_type] : undefined
  const symbol = symbolFor(text(args.symbol, 12), kind)
  if (!kind && symbol && METALS[symbol]) kind = 'metal'
  const date = day(args.date, today)

  // Cash moves, however they were asked for.
  if (name === 'add_money' || name === 'take_money_out' || (name === 'add_holding' && kind === 'cash')) {
    return {
      action: {
        id,
        type: 'cash',
        direction: name === 'take_money_out' ? 'out' : 'in',
        currency: currency(args.money_currency) ?? (symbol && isCurrency(symbol) ? symbol : undefined),
        amount: positive(args.money_amount) ?? positive(args.quantity),
        date,
        ...(cleanPurpose(args.purpose) ? { purpose: cleanPurpose(args.purpose) } : {}),
      },
      note: null,
    }
  }

  // The holding it refers to, found in the portfolio itself (never cash here).
  const held = symbol
    ? holdings.find((h) => h.ticker === symbol && kindOf(h.assetClass) !== 'cash' && (!kind || kindOf(h.assetClass) === kind))
    : undefined
  const pay = text(args.pay_from_cash, 12)
  const payFrom = pay?.toLowerCase() === 'outside' ? '' : currency(pay)
  const spend = amount(args.money_amount, args.money_currency)
  const quantity = positive(args.quantity)

  if (name === 'sell' || name === 'remove_holding') {
    if (!held) {
      return {
        action: null,
        note: symbol
          ? `${symbol} isn’t in this portfolio, so there is nothing to ${name === 'sell' ? 'sell' : 'remove'}.`
          : `Say which holding to ${name === 'sell' ? 'sell' : 'remove'}.`,
      }
    }
    if (name === 'remove_holding') return { action: { id, type: 'remove', holdingId: held.id, ticker: held.ticker }, note: null }
    return {
      action: {
        id,
        type: 'sell',
        holdingId: held.id,
        ticker: held.ticker,
        quantity: args.sell_all === true ? undefined : quantity,
        all: args.sell_all === true || undefined,
        date,
        into: currency(args.into_cash),
      },
      note: null,
    }
  }

  // Adding something already held is buying more of it.
  if (held) {
    return {
      action: { id, type: 'buy', holdingId: held.id, ticker: held.ticker, quantity: spend ? undefined : quantity, spend, date, payFrom },
      note: null,
    }
  }

  const how: HowGot | undefined =
    name === 'buy' || args.how === 'just_bought' ? 'bought' : args.how === 'already_owned' ? 'owned' : undefined
  return {
    action: {
      id,
      type: 'add',
      kind: kind === 'cash' ? undefined : kind,
      ticker: symbol,
      how,
      quantity: how === 'bought' && spend ? undefined : quantity,
      spend: how === 'owned' ? undefined : spend,
      cost: how === 'bought' ? undefined : amount(args.average_cost, args.cost_currency),
      date,
      payFrom: how === 'owned' ? undefined : payFrom,
    },
    note: null,
  }
}
