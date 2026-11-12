import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  APP_RESEARCH,
  GUEST_ONLY,
  MEMBER_ONLY,
  PUBLIC_RESEARCH,
  SIGNED_IN_HOME,
  matchesRoute,
} from '@/lib/routes'

/**
 * Runs before every page. Refreshes the Supabase session cookie, then sends
 * people away from pages that aren't for them:
 *
 * - signed in, asking for login / signup / forgot-password -> the dashboard
 * - signed out, asking for the dashboard or account pages  -> login, which
 *   returns them to the page they wanted
 * - signed in, asking for the public research pages         -> the same page
 *   inside the app, so they never drop out of their signed-in view
 *
 * This is the first check, not the only one: the dashboard layout, each page,
 * and every server action still verify the user themselves.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Form posts and server actions answer for themselves; only page loads are redirected.
  if (request.method !== 'GET' && request.method !== 'HEAD') return response

  const { pathname, search } = request.nextUrl

  // Keep any refreshed session cookies when answering with a redirect.
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (user && matchesRoute(pathname, GUEST_ONLY)) {
    return redirectTo(SIGNED_IN_HOME)
  }

  if (user && matchesRoute(pathname, [PUBLIC_RESEARCH])) {
    return redirectTo(APP_RESEARCH + pathname.slice(PUBLIC_RESEARCH.length) + search)
  }

  if (!user && matchesRoute(pathname, MEMBER_ONLY)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`)
  }

  return response
}
