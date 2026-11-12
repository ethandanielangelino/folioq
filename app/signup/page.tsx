import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthShell from '@/app/components/auth-shell'
import { textLink } from '@/app/components/styles'
import SignupForm from '@/app/signup/signup-form'
import { getSessionUser } from '@/lib/auth'
import { SIGNED_IN_HOME, safeNext } from '@/lib/routes'

export const metadata: Metadata = { title: 'Create an account — FolioQ' }

type Props = { searchParams: Promise<{ next?: string | string[] }> }

export default async function SignupPage({ searchParams }: Props) {
  // Someone who already has a session has no use for this page.
  // proxy.ts redirects them first; this is the second check.
  if (await getSessionUser()) redirect(SIGNED_IN_HOME)

  const params = await searchParams
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next
  const next = safeNext(rawNext)

  return (
    <AuthShell
      title="Create your account"
      lede="Free, with no card on file. You can add your first portfolio straight away."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={rawNext ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className={textLink}
          >
            Log in
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  )
}
