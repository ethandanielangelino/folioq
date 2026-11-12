// Server-side loaders for sharing a portfolio with another account.
// Everything here goes through the functions in supabase/sharing.sql; until
// that script has been run they don't exist, and each loader answers null so
// pages can say "not set up yet" instead of failing.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberRole = 'viewer' | 'editor'
/** What the signed-in person may do with a portfolio. */
export type PortfolioRole = 'owner' | MemberRole

export const INVITE_DAYS = 7

export interface Person {
  memberId: string
  name: string
  shareCode: string | null
  role: MemberRole
  status: 'pending' | 'accepted'
  invitedAt: string
  /** When an unanswered invite lapses. Null once accepted. */
  expiresAt: string | null
}

export interface SharedPortfolio {
  memberId: string
  portfolioId: string
  portfolioName: string
  ownerName: string
  role: MemberRole
  status: 'pending' | 'accepted'
  invitedAt: string
  expiresAt: string | null
}

/** PostgREST and Postgres codes for "that function or table isn't there". */
const NOT_SET_UP = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])

export function sharingNotSetUp(error: { code?: string } | null): boolean {
  return Boolean(error?.code && NOT_SET_UP.has(error.code))
}

const asRole = (value: unknown): MemberRole => (value === 'editor' ? 'editor' : 'viewer')
const asStatus = (value: unknown) => (value === 'accepted' ? 'accepted' : 'pending') as Person['status']

/**
 * Turns whatever someone typed into the canonical FQ-XXXX-XXXX form, or null
 * if it can't be a share ID. Spaces, lower case, and a missing "FQ-" are fine.
 */
export function normalizeShareCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = compact.startsWith('FQ') && compact.length === 10 ? compact.slice(2) : compact
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(body)) return null
  return `FQ-${body.slice(0, 4)}-${body.slice(4)}`
}

/** The signed-in account's share ID, created on first use. Null if sharing isn't set up. */
export async function getMyProfile(
  supabase: SupabaseClient,
  name: string | null
): Promise<{ shareCode: string; displayName: string } | null> {
  const { data, error } = await supabase.rpc('ensure_profile', { p_name: name })
  if (error || !data) return null
  const row = (Array.isArray(data) ? data[0] : data) as { share_code?: string; display_name?: string }
  return row?.share_code ? { shareCode: row.share_code, displayName: row.display_name ?? '' } : null
}

/** For the owner: everyone this portfolio is shared with. Null if sharing isn't set up. */
export async function getPeople(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<Person[] | null> {
  const { data, error } = await supabase.rpc('portfolio_people', { p_portfolio: portfolioId })
  if (error) return null
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    memberId: String(row.member_id),
    name: String(row.display_name ?? 'FolioQ user'),
    shareCode: row.share_code ? String(row.share_code) : null,
    role: asRole(row.role),
    status: asStatus(row.status),
    invitedAt: String(row.invited_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  }))
}

/** Portfolios other people have shared with the signed-in account. Null if sharing isn't set up. */
export async function getSharedWithMe(supabase: SupabaseClient): Promise<SharedPortfolio[] | null> {
  const { data, error } = await supabase.rpc('shared_with_me')
  if (error) return null
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    memberId: String(row.member_id),
    portfolioId: String(row.portfolio_id),
    portfolioName: String(row.portfolio_name ?? 'Portfolio'),
    ownerName: String(row.owner_name ?? 'Someone'),
    role: asRole(row.role),
    status: asStatus(row.status),
    invitedAt: String(row.invited_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  }))
}

/** "6 days", "1 day", "a few hours": how long an invite has left. */
export function timeLeft(expiresAt: string | null, now: number = Date.now()): string {
  if (!expiresAt) return ''
  const hours = (new Date(expiresAt).getTime() - now) / 3_600_000
  if (hours <= 0) return 'no time'
  if (hours < 24) return 'less than a day'
  // Rounded up, so an invite sent a moment ago reads "7 days", not "6".
  const days = Math.ceil(hours / 24)
  return `${days} days`
}
