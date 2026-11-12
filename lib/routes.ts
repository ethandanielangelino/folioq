// Which pages are for whom. Used by proxy.ts to redirect, and by the auth
// pages and routes to decide where to send someone next.

/** Pages that only make sense signed out. A signed-in visitor goes to the dashboard instead. */
export const GUEST_ONLY = ['/login', '/signup', '/forgot-password']

/** Pages that need an account. A signed-out visitor goes to the login page instead. */
export const MEMBER_ONLY = ['/dashboard', '/account']

export const SIGNED_IN_HOME = '/dashboard'

/** Research has a public version and one inside the signed-in app. */
export const PUBLIC_RESEARCH = '/research'
export const APP_RESEARCH = '/dashboard/research'

export function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

/**
 * Where to go after signing in. Only same-site paths are accepted, so a
 * crafted link can't bounce someone to another website, and guest-only pages
 * are skipped because they would just redirect again.
 */
export function safeNext(value: string | null | undefined, fallback = SIGNED_IN_HOME): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  const pathname = value.split(/[?#]/)[0]
  if (matchesRoute(pathname, GUEST_ONLY) || pathname.startsWith('/auth/')) return fallback
  return value
}

/**
 * The address Supabase sends people back to after Google sign-in or an
 * emailed link. `next` is only added when it isn't the default, so the
 * everyday address stays exactly `<site>/auth/callback`.
 */
export function callbackUrl(next: string = SIGNED_IN_HOME): string {
  const base = `${window.location.origin}/auth/callback`
  return next === SIGNED_IN_HOME ? base : `${base}?next=${encodeURIComponent(next)}`
}
