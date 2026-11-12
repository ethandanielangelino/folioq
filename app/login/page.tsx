import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthShell from '@/app/components/auth-shell'
import { textLink } from '@/app/components/styles'
import LoginForm from '@/app/login/login-form'
import { getSessionUser } from '@/lib/auth'
import { SIGNED_IN_HOME, safeNext } from '@/lib/routes'

export const metadata: Metadata = { title: 'Log in — FolioQ' }

// Why someone was sent here by a link that didn't work.
const notices: Record<string, string> = {
  invalid_link:
    'That email link is invalid or has expired. Log in, or ask for a new link.',
  oauth_failed: 'Google sign-in didn’t complete. Try again.',
}

// Good news that brings someone here.
const confirmations: Record<string, string> = {
  password_changed:
    'Your password has been changed and every device has been signed out. Log in with the new password.',
}

type Props = {
  searchParams: Promise<{
    next?: string | string[]
    error?: string | string[]
    notice?: string | string[]
  }>
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function LoginPage({ searchParams }: Props) {
  // proxy.ts already redirects signed-in visitors; this is the second check.
  if (await getSessionUser()) redirect(SIGNED_IN_HOME)

  const params = await searchParams
  const rawNext = first(params.next)
  const next = safeNext(rawNext)
  const signupHref = rawNext ? `/signup?next=${encodeURIComponent(next)}` : '/signup'

  return (
    <AuthShell
      title="Welcome back"
      lede={
        rawNext
          ? 'Log in to continue to the page you asked for.'
          : 'Log in to your portfolios.'
      }
      footer={
        <>
          No account yet?{' '}
          <Link href={signupHref} className={textLink}>
            Create one
          </Link>
        </>
      }
    >
      <LoginForm
        next={next}
        notice={notices[first(params.error) ?? ''] ?? null}
        confirmation={confirmations[first(params.notice) ?? ''] ?? null}
      />
    </AuthShell>
  )
}
