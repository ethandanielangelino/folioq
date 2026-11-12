import { redirect } from 'next/navigation'
import {
  NameForm,
  PasswordForm,
  ShareIdCard,
  SignOutButton,
  type PasswordMode,
} from '@/app/account/account-forms'
import { CurrencyPicker, RateNote } from '@/app/components/money'
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
        description="Give this to someone who wants to share a portfolio with you. It only lets them send you an invite, which you can accept or decline. It stays hidden until you press Show; Copy works either way."
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
        title="Currency"
        description="Choose the currency every amount in FolioQ is shown in. It follows your account to any device you sign in on."
      >
        <CurrencyPicker id="account-currency" />
        <RateNote
          pointToSettings={false}
          className="mt-3 max-w-md text-xs leading-5 text-zinc-700 dark:text-zinc-300"
        />
        <div className="mt-4 max-w-md rounded-2xl border border-amber-deep/40 bg-amber-tint/25 px-4 py-3 text-xs leading-5 text-zinc-700 dark:bg-amber-deep/10 dark:text-zinc-300">
          <p className="font-medium text-black dark:text-zinc-50">
            Prices are live in US dollars only
          </p>
          <p className="mt-1">
            US-listed shares trade in US dollars, so that is the currency prices arrive in and the
            one you enter costs in. In any other currency, every amount (values, costs, gains,
            and the day&apos;s rise or fall) is the dollar figure converted at the current
            exchange rate. It may not reflect exactly what you would get on exchanging, and past
            costs are converted at today&apos;s rate, not the rate on the day you bought.
            Percentages are not affected.
          </p>
          <p className="mt-2">
            Exchange rates come from{' '}
            <a href="https://fxratesapi.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              fxratesapi.com
            </a>{' '}
            (live, refreshed every minute), with{' '}
            <a href="https://www.coinbase.com/converter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Coinbase
            </a>{' '}
            as a backup. Each live rate is checked against the European Central Bank&apos;s daily
            rate, taken from{' '}
            <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              frankfurter.dev
            </a>
            , which is used instead if the live rate is unavailable or looks wrong.
          </p>
        </div>
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
