'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getOwnedPortfolioView, getPortfolioRole, isUuid } from '@/lib/data'
import {
  getCompanyNews,
  getProfile,
  lookupQuote,
  normalizeSymbol,
  searchSymbols,
  type SymbolMatch,
} from '@/lib/finnhub'
import { marketDate } from '@/lib/format'
import { draftThesis, type ThesisDraft } from '@/lib/gemini'
import { normalizeShareCode, sharingNotSetUp, type MemberRole } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, HoldingRow } from '@/lib/types'

const SIGNED_OUT = 'Your session has expired. Log in again.'
const NOT_FOUND = 'Portfolio not found.'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type Supabase = Awaited<ReturnType<typeof createClient>>

// Every action re-checks the session and what this person may do with the
// portfolio. Row level security enforces the same rules again in the database.
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function refresh(portfolioId: string) {
  revalidatePath('/dashboard', 'layout')
  revalidatePath(`/dashboard/${portfolioId}`)
}

/**
 * What the signed-in user may do with this portfolio: 'owner', 'editor',
 * 'viewer', or null if they can't see it at all. Being able to see a
 * portfolio is no longer the same as owning it, so every action asks.
 */
async function roleOn(supabase: Supabase, userId: string, portfolioId: string) {
  if (!isUuid(portfolioId)) return null
  const { data } = await supabase
    .from('portfolios')
    .select('id, user_id')
    .eq('id', portfolioId)
    .maybeSingle()
  if (!data) return null
  return getPortfolioRole(supabase, data as { id: string; user_id: string }, userId)
}

/** Only the owner renames, deletes, shares, or clears the assistant conversation. */
async function ownsPortfolio(supabase: Supabase, userId: string, portfolioId: string) {
  return (await roleOn(supabase, userId, portfolioId)) === 'owner'
}

/** The owner and anyone invited as an editor may change holdings and theses. */
async function canEdit(supabase: Supabase, userId: string, portfolioId: string) {
  const role = await roleOn(supabase, userId, portfolioId)
  return role === 'owner' || role === 'editor'
}

const VIEW_ONLY = 'This portfolio was shared with you as view-only, so you can’t change it.'

async function findHolding(
  supabase: Supabase,
  portfolioId: string,
  holdingId: string
): Promise<HoldingRow | null> {
  if (!isUuid(portfolioId) || !isUuid(holdingId)) return null
  const { data } = await supabase
    .from('holdings')
    .select('*')
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle()
  return (data as HoldingRow | null) ?? null
}

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

type PortfolioFields =
  | { valid: true; name: string; mandate: string | null }
  | { valid: false; error: string }

function validatePortfolioFields(formData: FormData): PortfolioFields {
  const name = text(formData, 'name')
  const mandate = text(formData, 'mandate')
  if (!name) return { valid: false, error: 'Give the portfolio a name.' }
  if (name.length > 80) return { valid: false, error: 'Keep the name under 80 characters.' }
  if (mandate.length > 500) {
    return { valid: false, error: 'Keep the mandate under 500 characters.' }
  }
  return { valid: true, name, mandate: mandate || null }
}

export async function createPortfolio(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  const fields = validatePortfolioFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({ user_id: user.id, name: fields.name, mandate: fields.mandate })
    .select('id')
    .single()

  if (error || !data) {
    // 42501: row level security refused the insert, which means the owner
    // policies from supabase/setup.sql aren't in place yet.
    if (error?.code === '42501') {
      return {
        ok: false,
        error:
          'The database refused to save this. Run supabase/setup.sql in the Supabase SQL editor to add the access rules, then try again.',
      }
    }
    return { ok: false, error: 'Could not create the portfolio. Try again.' }
  }

  revalidatePath('/dashboard', 'layout')
  redirect(`/dashboard/${data.id}`)
}

export async function updatePortfolio(
  portfolioId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const fields = validatePortfolioFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { data, error } = await supabase
    .from('portfolios')
    .update({ name: fields.name, mandate: fields.mandate })
    .eq('id', portfolioId)
    // Only the owner renames a portfolio or rewrites its purpose.
    .eq('user_id', user.id)
    .select('id')

  if (error) return { ok: false, error: 'Could not save the changes. Try again.' }
  if (!data?.length) return { ok: false, error: NOT_FOUND }

  refresh(portfolioId)
  return { ok: true }
}

export async function deletePortfolio(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  // Remove children first, in dependency order, so this works whether or not
  // the foreign keys were created with ON DELETE CASCADE.
  const failed = { ok: false, error: 'Could not delete the portfolio. Try again.' } as const

  const { data: holdings, error: holdingsError } = await supabase
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
  if (holdingsError) return failed

  const holdingIds = (holdings ?? []).map((h) => h.id as string)
  if (holdingIds.length > 0) {
    const theses = await supabase.from('theses').delete().in('holding_id', holdingIds)
    if (theses.error) return failed
  }
  const removedHoldings = await supabase.from('holdings').delete().eq('portfolio_id', portfolioId)
  if (removedHoldings.error) return failed
  const removedMessages = await supabase.from('messages').delete().eq('portfolio_id', portfolioId)
  if (removedMessages.error) return failed

  const { error } = await supabase.from('portfolios').delete().eq('id', portfolioId)
  if (error) return failed

  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/portfolios')
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

type HoldingFields =
  | { valid: true; quantity: number; costBasis: number | null; openedAt: string }
  | { valid: false; error: string }

function validateHoldingFields(formData: FormData): HoldingFields {
  const quantity = Number(text(formData, 'quantity'))
  const costText = text(formData, 'cost_basis')
  const costBasis = costText === '' ? null : Number(costText)
  const openedAt = text(formData, 'opened_at')

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { valid: false, error: 'Shares must be a number greater than zero.' }
  }
  if (costBasis !== null && (!Number.isFinite(costBasis) || costBasis <= 0)) {
    return { valid: false, error: 'Average cost must be a number greater than zero, or left blank.' }
  }
  if (quantity > 1e12 || (costBasis !== null && costBasis > 1e9)) {
    return { valid: false, error: 'That number is too large.' }
  }
  if (!DATE_PATTERN.test(openedAt) || Number.isNaN(Date.parse(openedAt))) {
    return { valid: false, error: 'Pick the date the position was opened.' }
  }
  if (openedAt > marketDate()) {
    return { valid: false, error: 'The opening date cannot be in the future.' }
  }
  if (openedAt < '1970-01-01') return { valid: false, error: 'That date is too far back.' }

  return { valid: true, quantity, costBasis, openedAt }
}

export async function addHolding(portfolioId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const ticker = normalizeSymbol(text(formData, 'ticker'))
  if (!ticker) return { ok: false, error: 'Enter a ticker symbol, like AAPL.' }

  const fields = validateHoldingFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { data: existing, error: existingError } = await supabase
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .eq('ticker', ticker)
  if (existingError) return { ok: false, error: 'Could not check existing holdings. Try again.' }
  if (existing?.length) {
    return {
      ok: false,
      error: `${ticker} is already in this portfolio. Edit that holding to change the share count.`,
    }
  }

  // Reject tickers the market data provider has never heard of. If the provider
  // itself is unreachable we let it through rather than block bookkeeping.
  const lookup = await lookupQuote(ticker)
  if (lookup.status === 'unknown') {
    return { ok: false, error: `No market data for “${ticker}”. Check the ticker symbol.` }
  }

  const { error } = await supabase.from('holdings').insert({
    portfolio_id: portfolioId,
    ticker,
    quantity: fields.quantity,
    cost_basis: fields.costBasis,
    opened_at: fields.openedAt,
  })
  if (error) return { ok: false, error: 'Could not save the holding. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export async function updateHolding(
  portfolioId: string,
  holdingId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await findHolding(supabase, portfolioId, holdingId))) {
    return { ok: false, error: 'Holding not found.' }
  }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const fields = validateHoldingFields(formData)
  if (!fields.valid) return { ok: false, error: fields.error }

  const { error } = await supabase
    .from('holdings')
    .update({
      quantity: fields.quantity,
      cost_basis: fields.costBasis,
      opened_at: fields.openedAt,
    })
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
  if (error) return { ok: false, error: 'Could not save the holding. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export async function deleteHolding(portfolioId: string, holdingId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await findHolding(supabase, portfolioId, holdingId))) {
    return { ok: false, error: 'Holding not found.' }
  }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const failed = { ok: false, error: 'Could not delete the holding. Try again.' } as const
  const theses = await supabase.from('theses').delete().eq('holding_id', holdingId)
  if (theses.error) return failed
  const { error } = await supabase
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('portfolio_id', portfolioId)
  if (error) return failed

  refresh(portfolioId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Theses
// ---------------------------------------------------------------------------

function cleanList(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null
  const list = items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  if (list.length > 12 || list.some((item) => item.length > 400)) return null
  return list
}

/** Saves a new version of a holding's thesis. Earlier versions are kept. */
export async function saveThesis(
  portfolioId: string,
  holdingId: string,
  input: { claim: string; assumptions: string[]; risks: string[]; authorEdited: boolean }
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await findHolding(supabase, portfolioId, holdingId))) {
    return { ok: false, error: 'Holding not found.' }
  }
  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const claim = typeof input?.claim === 'string' ? input.claim.trim() : ''
  const assumptions = cleanList(input?.assumptions)
  const risks = cleanList(input?.risks)

  if (!claim) return { ok: false, error: 'Write the claim: why does this position belong here?' }
  if (claim.length > 1000) return { ok: false, error: 'Keep the claim under 1,000 characters.' }
  if (!assumptions || !risks) {
    return {
      ok: false,
      error: 'Use at most 12 assumptions and 12 risks, each under 400 characters.',
    }
  }

  const { data: versions, error: versionsError } = await supabase
    .from('theses')
    .select('version')
    .eq('holding_id', holdingId)
  if (versionsError) return { ok: false, error: 'Could not load the current thesis. Try again.' }
  const next = Math.max(0, ...(versions ?? []).map((v) => Number(v.version) || 0)) + 1

  const { error } = await supabase.from('theses').insert({
    holding_id: holdingId,
    version: next,
    claim,
    assumptions,
    risks,
    author_edited: Boolean(input.authorEdited),
  })
  if (error) return { ok: false, error: 'Could not save the thesis. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export type DraftResult = { ok: true; draft: ThesisDraft } | { ok: false; error: string }

/** Asks the AI for a first draft. Nothing is saved until the owner saves it. */
export async function draftThesisForHolding(
  portfolioId: string,
  holdingId: string
): Promise<DraftResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  if (!(await canEdit(supabase, user.id, portfolioId))) return { ok: false, error: VIEW_ONLY }

  const view = await getOwnedPortfolioView(supabase, portfolioId)
  const holding = view?.holdings.find((h) => h.id === holdingId)
  if (!view || !holding) return { ok: false, error: 'Holding not found.' }

  const [profile, news] = await Promise.all([
    getProfile(holding.ticker),
    getCompanyNews(holding.ticker),
  ])

  const result = await draftThesis({
    ticker: holding.ticker,
    profile,
    quote: view.quotes[holding.ticker] ?? null,
    holding: {
      quantity: holding.quantity,
      costBasis: holding.costBasis,
      openedAt: holding.openedAt,
    },
    mandate: view.portfolio.mandate,
    weight: holding.weight,
    news,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, draft: result.value }
}

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------

export async function clearMessages(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase.from('messages').delete().eq('portfolio_id', portfolioId)
  if (error) return { ok: false, error: 'Could not clear the conversation. Try again.' }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Sharing and lookups
// ---------------------------------------------------------------------------

/**
 * Makes the portfolio's link public (anyone with it can view, with a fresh
 * token each time) or private again (the link stops working for everyone).
 */
export async function setSharing(portfolioId: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const { data, error } = await supabase
    .from('portfolios')
    .update({ share_token: enabled ? randomUUID() : null })
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    // PGRST204 / 42703: the share_token column doesn't exist yet.
    if (error.code === 'PGRST204' || error.code === '42703') {
      return {
        ok: false,
        error: 'Sharing needs one more database column. Run supabase/setup.sql in the Supabase SQL editor.',
      }
    }
    return { ok: false, error: 'Could not update sharing. Try again.' }
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND }

  revalidatePath(`/dashboard/${portfolioId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Sharing with people (needs supabase/sharing.sql)
// ---------------------------------------------------------------------------

const SHARING_NOT_SET_UP =
  'Sharing with people needs one more database script. Run supabase/sharing.sql in the Supabase SQL editor.'

const asMemberRole = (value: unknown): MemberRole | null =>
  value === 'viewer' || value === 'editor' ? value : null

export type LookupResult =
  | { ok: true; code: string; name: string }
  | { ok: false; error: string }

/** Step one of sharing: whose share ID is this? Nothing is shared yet. */
export async function lookupShareCode(input: string): Promise<LookupResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  const code = typeof input === 'string' ? normalizeShareCode(input) : null
  if (!code) {
    return { ok: false, error: 'A share ID looks like FQ-7K3M-9X2P. Check what you typed.' }
  }

  const { data, error } = await supabase.rpc('find_profile_by_code', { p_code: code })
  if (error) {
    return { ok: false, error: sharingNotSetUp(error) ? SHARING_NOT_SET_UP : 'Could not look that ID up. Try again.' }
  }
  const match = ((data ?? []) as { display_name: string; is_self: boolean }[])[0]
  if (!match) return { ok: false, error: `No account has the share ID ${code}. Ask them to check it in their account settings.` }
  if (match.is_self) return { ok: false, error: 'That is your own share ID.' }
  return { ok: true, code, name: match.display_name }
}

/** Step two: send the invite. They have 7 days to accept. */
export async function inviteMember(
  portfolioId: string,
  codeInput: string,
  roleInput: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId)) return { ok: false, error: NOT_FOUND }

  const code = typeof codeInput === 'string' ? normalizeShareCode(codeInput) : null
  const role = asMemberRole(roleInput)
  if (!code || !role) return { ok: false, error: 'Choose who to share with and what they can do.' }

  const { data, error } = await supabase.rpc('invite_to_portfolio', {
    p_portfolio: portfolioId,
    p_code: code,
    p_role: role,
  })
  if (error) {
    return { ok: false, error: sharingNotSetUp(error) ? SHARING_NOT_SET_UP : 'Could not send the invite. Try again.' }
  }

  const failures: Record<string, string> = {
    not_owner: NOT_FOUND,
    bad_role: 'Choose view-only or editor.',
    not_found: `No account has the share ID ${code}.`,
    self: 'That is your own share ID.',
    already_invited: 'They already have an invite to this portfolio that they haven’t answered yet.',
    already_member: 'They already have access to this portfolio.',
  }
  if (data !== 'ok') return { ok: false, error: failures[String(data)] ?? 'Could not send the invite. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

/** The owner switches someone between view-only and editor. */
export async function setMemberRole(
  portfolioId: string,
  memberId: string,
  roleInput: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const role = asMemberRole(roleInput)
  if (!isUuid(portfolioId) || !isUuid(memberId) || !role) return { ok: false, error: NOT_FOUND }

  const { data, error } = await supabase.rpc('set_member_role', { p_member: memberId, p_role: role })
  if (error || data !== 'ok') return { ok: false, error: 'Could not change their access. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

/** The owner takes someone's access away, or withdraws an unanswered invite. */
export async function removeMember(portfolioId: string, memberId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(portfolioId) || !isUuid(memberId)) return { ok: false, error: NOT_FOUND }
  if (!(await ownsPortfolio(supabase, user.id, portfolioId))) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('id', memberId)
    .eq('portfolio_id', portfolioId)
  if (error) return { ok: false, error: 'Could not remove their access. Try again.' }

  refresh(portfolioId)
  return { ok: true }
}

export type InviteAnswer = { ok: true; outcome: 'accepted' | 'declined' } | { ok: false; error: string }

/** The invited person accepts or declines. */
export async function respondToInvite(memberId: string, accept: boolean): Promise<InviteAnswer> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(memberId)) return { ok: false, error: 'That invite no longer exists.' }

  const { data, error } = await supabase.rpc('respond_to_invite', {
    p_member: memberId,
    p_accept: accept === true,
  })
  revalidatePath('/dashboard', 'layout')
  if (error) return { ok: false, error: 'Could not answer the invite. Try again.' }
  if (data === 'expired') {
    return { ok: false, error: 'That invite expired after 7 days. Ask them to send a new one.' }
  }
  if (data !== 'accepted' && data !== 'declined') {
    return { ok: false, error: 'That invite no longer exists. It may have been withdrawn.' }
  }
  return { ok: true, outcome: data }
}

/** Someone removes a shared portfolio from their own list. They lose access until invited again. */
export async function leavePortfolio(memberId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(memberId)) return { ok: false, error: NOT_FOUND }

  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('id', memberId)
    // Their own membership only; the owner removes others with removeMember.
    .eq('user_id', user.id)
  if (error) return { ok: false, error: 'Could not remove it from your list. Try again.' }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}

/** Ticker suggestions for the holding form. */
export async function suggestSymbols(query: string): Promise<SymbolMatch[]> {
  const { user } = await requireUser()
  if (!user || typeof query !== 'string') return []
  return searchSymbols(query.slice(0, 40), 8)
}

/** Latest price for the "use latest price" shortcut in the holding form. */
export async function latestPrice(symbolInput: string): Promise<number | null> {
  const { user } = await requireUser()
  if (!user || typeof symbolInput !== 'string') return null
  const symbol = normalizeSymbol(symbolInput)
  if (!symbol) return null
  const lookup = await lookupQuote(symbol)
  return lookup.status === 'ok' ? lookup.quote.price : null
}
