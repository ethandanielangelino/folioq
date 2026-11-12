'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Ends the session and returns to the public home page. */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
