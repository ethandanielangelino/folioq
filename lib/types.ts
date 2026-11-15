// Row shapes for the existing Supabase tables.

export interface PortfolioRow {
  id: string
  user_id: string
  name: string
  /** What the portfolio is for, in the owner's words. */
  mandate: string | null
  created_at: string
  /** Added by supabase/setup.sql. Absent until that script has been run. */
  share_token?: string | null
}

export interface HoldingRow {
  id: string
  portfolio_id: string
  ticker: string
  quantity: number
  /** Average cost per unit (share, coin, or troy ounce), in USD. Null for cash. */
  cost_basis: number | null
  /** YYYY-MM-DD */
  opened_at: string
  created_at: string
  /**
   * What kind of holding this is (see lib/assets.ts). Added by
   * supabase/assets.sql: absent until that script has been run, when every
   * holding is a US-listed stock.
   */
  asset_class?: string | null
}

/** A thesis as stored: assumptions and risks are jsonb, so not trusted to be string arrays. */
export interface ThesisRow {
  id: string
  holding_id: string
  version: number
  claim: string | null
  assumptions: unknown
  risks: unknown
  author_edited: boolean | null
  created_at: string
}

/** A thesis ready to render. */
export interface Thesis {
  id: string
  holdingId: string
  version: number
  claim: string
  assumptions: string[]
  risks: string[]
  /** False means the text is an AI draft saved without changes. */
  authorEdited: boolean
  createdAt: string
}

export type MessageRole = 'user' | 'assistant'

export interface MessageRow {
  id: string
  portfolio_id: string
  role: MessageRole
  content: string
  created_at: string
  /**
   * Which chat this message belongs to. Added by supabase/chats.sql: absent
   * until that script has been run, and null on a message saved before it.
   */
  chat_id?: string | null
}

export interface PriceRow {
  ticker: string
  /** YYYY-MM-DD */
  price_date: string
  close: number
}

/** What server actions return: success, or a message to show the user. */
export type ActionResult = { ok: true } | { ok: false; error: string }
