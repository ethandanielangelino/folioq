import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function signOut() {
  'use server'

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="max-w-3xl mx-auto mt-16 p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium">Your portfolios</h1>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </div>
      <p className="text-sm text-gray-600">Signed in as {user.email}</p>
    </main>
  )
}