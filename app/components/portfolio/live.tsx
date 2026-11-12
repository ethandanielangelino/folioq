'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

const REFRESH_MS = 60_000

function ago(seconds: number): string {
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return minutes === 1 ? '1 min ago' : `${minutes} min ago`
}

/**
 * Keeps a server-rendered page fresh: re-fetches it every minute while the
 * tab is visible, and shows when prices were last pulled.
 */
export function LiveRefresh({ renderedAt }: { renderedAt: number }) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [now, setNow] = useState(renderedAt)

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh())
    }, REFRESH_MS)
    // Catch up straight away when the tab comes back after a while.
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - renderedAt > REFRESH_MS) {
        startTransition(() => router.refresh())
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, renderedAt])

  const seconds = Math.max(0, Math.round((now - renderedAt) / 1000))

  return (
    <div className="flex items-center gap-2.5 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-mint-500" />
      </span>
      <span>
        Live prices, updated <span className="tabular-nums">{ago(seconds)}</span>
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={refreshing}
        aria-label="Refresh prices now"
        title="Refresh prices now"
        className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/[.05] hover:text-black disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Wraps a figure and briefly tints it when the number underneath changes, so
 * a refresh shows what moved. `value` is the raw number; children is how it's shown.
 */
export function Flash({
  value,
  children,
  className = '',
}: {
  value: number | null
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)

  useEffect(() => {
    const before = previous.current
    previous.current = value
    if (before === null || value === null || before === value) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tint = value > before ? 'rgb(16 185 129 / 0.28)' : 'rgb(239 68 68 / 0.24)'
    ref.current?.animate([{ backgroundColor: tint }, { backgroundColor: 'transparent' }], {
      duration: 1400,
      easing: 'ease-out',
    })
  }, [value])

  return (
    <span ref={ref} className={`-mx-1 rounded-md px-1 ${className}`}>
      {children}
    </span>
  )
}
