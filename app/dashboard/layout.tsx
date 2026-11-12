import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppShell from '@/app/components/app-shell'
import { MoneyProvider } from '@/app/components/money'
import { displayName, getSessionUser } from '@/lib/auth'
import { getPortfolioNames } from '@/lib/data'
import { getMoney } from '@/lib/money'
import { getSharedWithMe } from '@/lib/sharing'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Your portfolios — FolioQ',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard')

  const supabase = await createClient()
  const [portfolios, shared, money] = await Promise.all([
    getPortfolioNames(supabase, user.id),
    getSharedWithMe(supabase),
    getMoney(),
  ])
  const invites = (shared ?? []).filter((s) => s.status === 'pending').length

  return (
    <MoneyProvider value={money}>
      <AppShell
        user={{ email: user.email ?? '', name: displayName(user) }}
        portfolios={portfolios}
        invites={invites}
      >
        {children}
      </AppShell>
    </MoneyProvider>
  )
}
