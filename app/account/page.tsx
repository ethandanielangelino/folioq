import { redirect } from 'next/navigation'
import {
  NameForm,
  PasswordForm,
  ShareIdCard,
  SignOutButton,
  type PasswordMode,
} from '@/app/account/account-forms'
import { card } from '@/app/components/styles'
import { displayName, getSessionUser, hasPassword } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { inRecovery } from '@/lib/recovery'
import { getMyProfile } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

function Block({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className={`${card} grid gap-x-10 gap-y-5 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`}>
      <div>
        <h2 className="text-2xl leading-tight text-black dark:text-zinc-50">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  )
}

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/account')

  const name = displayName(user)
  const [recovering, profile] = await Promise.all([
    inRecovery(user.id),
    getMyProfile(await createClient(), name),
  ])
  const usesGoogle = user.app_metadata?.providers?.includes('google') ?? false
  const mode: PasswordMode = recovering ? 'reset' : hasPassword(user) ? 'change' : 'set'

  const passwordHelp: Record<PasswordMode, string> = {
    reset: 'Your reset link worked. Choose a new password; you don’t need the old one.',
    change: 'Enter your current password, then the new one twice.',
    set: usesGoogle
      ? 'You sign in with Google and have no password yet. Set one and you can also log in with your email and password.'
      : 'This account has no password yet. Set one to log in with your email and password.',
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl leading-[1.08] text-black sm:text-5xl dark:text-zinc-50">
          Account settings
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium text-black dark:text-zinc-50">{user.email}</span>
          {user.created_at && `, a member since ${formatDate(user.created_at)}`}.
        </p>
      </div>

      {mode === 'reset' && (
        <p
          role="status"
          className="rounded-2xl border border-mint-500/40 bg-mint-50 px-5 py-4 text-sm leading-6 text-mint-900 dark:bg-mint-900/25 dark:text-mint-200"
        >
          Your reset link worked and you&apos;re signed in. Choose a new password below.
        </p>
      )}

      <Block title={mode === 'set' ? 'Set a password' : 'Password'} description={passwordHelp[mode]}>
        <PasswordForm mode={mode} email={user.email ?? ''} />
      </Block>

      <Block
        title="Your share ID"
        description="Give this to someone who wants to share a portfolio with you. It only lets them send you an invite, which you can accept or decline."
      >
        {profile ? (
          <ShareIdCard code={profile.shareCode} />
        ) : (
          <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Share IDs aren&apos;t set up yet. Run{' '}
            <code className="font-mono text-xs">supabase/sharing.sql</code> in the Supabase SQL
            editor, then reload this page.
          </p>
        )}
      </Block>

      <Block
        title="Your name"
        description="Shown in the account menu, and to people you share a portfolio with or who share one with you. It is not shown on public links."
      >
        <NameForm initialName={name ?? ''} />
      </Block>

      <Block
        title="Sign out"
        description="Ends your session. Your portfolios and shared links stay exactly as they are."
      >
        <SignOutButton />
      </Block>
    </div>
  )
}
