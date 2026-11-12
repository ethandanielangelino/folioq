'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface Watch {
  table: 'portfolios' | 'holdings' | 'theses' | 'portfolio_members'
  /** A Supabase realtime filter such as "portfolio_id=eq.<id>". */
  filter?: string
}

/**
 * Reloads the page's data the moment someone else changes it: an editor adds
 * a holding, an invite arrives, access is removed. Listens to Supabase's
 * realtime feed, which only delivers rows this person is allowed to see.
 *
 * If the feed isn't available (supabase/sharing.sql adds the tables to it)
 * nothing breaks: pages still refresh on their own every minute.
 */
export default function LiveSync({ name, watch }: { name: string; watch: Watch[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // A stable string so the effect only re-subscribes when what is watched changes.
  const signature = JSON.stringify(watch)

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null

    // Several rows often change together (a holding and its thesis); wait a
    // beat and reload once.
    const reload = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => startTransition(() => router.refresh()), 350)
    }

    let channel = supabase.channel(`folioq:${name}`)
    for (const { table, filter } of JSON.parse(signature) as Watch[]) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        reload
      )
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [name, signature, router])

  return null
}
