import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppShell from '@/app/components/app-shell'
import { displayName, getSessionUser } from '@/lib/auth'
import { getPortfolioNames } from '@/lib/data'
import { getSharedWithMe } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Account settings — FolioQ',
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/account')

  const supabase = await createClient()
  const [portfolios, shared] = await Promise.all([
    getPortfolioNames(supabase, user.id),
    getSharedWithMe(supabase),
  ])
  const invites = (shared ?? []).filter((s) => s.status === 'pending').length

  return (
    <AppShell
      user={{ email: user.email ?? '', name: displayName(user) }}
      portfolios={portfolios}
      invites={invites}
    >
      {children}
    </AppShell>
  )
}
