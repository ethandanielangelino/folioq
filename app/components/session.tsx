'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Marks <html data-session="in"> when a Supabase session cookie is present.
 * CSS (.guest-only / .member-only in globals.css) then shows the matching
 * variant of headers, footers, and calls to action.
 *
 * The same script restores whether the signed-in sidebar was left hidden.
 *
 * The cookie is only a hint for what to *show*. Whether someone may open a
 * page is decided on the server, in proxy.ts and in each page.
 */
const MARK_SESSION = `(function(){try{var d=document.documentElement;if(/(?:^|; )sb-[^=;]+-auth-token(?:\\.\\d+)?=/.test(document.cookie)){d.setAttribute('data-session','in')}else{d.removeAttribute('data-session')}if(localStorage.getItem('folioq-sidebar')==='closed'){d.setAttribute('data-sidebar','closed')}}catch(e){}})()`

function markSession() {
  const signedIn = /(?:^|; )sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie)
  if (signedIn) document.documentElement.setAttribute('data-session', 'in')
  else document.documentElement.removeAttribute('data-session')
}

/** Runs while the page is still being parsed, so the first paint is already right. */
export function SessionScript() {
  return <script dangerouslySetInnerHTML={{ __html: MARK_SESSION }} />
}

/** Re-checks after each navigation (signing in or out) and when the tab regains focus. */
export function SessionSync() {
  const pathname = usePathname()

  useEffect(() => {
    markSession()
  }, [pathname])

  useEffect(() => {
    window.addEventListener('focus', markSession)
    return () => window.removeEventListener('focus', markSession)
  }, [])

  return null
}

/** Shown only to visitors who are not signed in. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  return <span className="guest-only">{children}</span>
}

/** Shown only to signed-in visitors. */
export function MemberOnly({ children }: { children: React.ReactNode }) {
  return <span className="member-only">{children}</span>
}
