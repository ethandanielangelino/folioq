'use client'

import { flushSync } from 'react-dom'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

/**
 * One button that flips between light and dark. The new theme spreads out
 * from the button in a circle (where the browser supports view transitions
 * and the device hasn't asked for reduced motion; otherwise it just switches).
 *
 * Until someone presses it, the site follows the device's setting.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { setTheme } = useTheme()

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement
    const next = root.classList.contains('dark') ? 'light' : 'dark'

    const apply = () => {
      // Remember the choice, and repaint in the same frame so the transition
      // captures the finished page rather than a half-switched one.
      flushSync(() => setTheme(next))
      root.classList.toggle('dark', next === 'dark')
      root.classList.toggle('light', next === 'light')
      root.style.colorScheme = next
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      apply()
      return
    }

    // Grow the circle from the middle of the button to the farthest corner.
    const box = event.currentTarget.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    root.style.setProperty('--theme-x', `${x}px`)
    root.style.setProperty('--theme-y', `${y}px`)
    root.style.setProperty('--theme-r', `${radius}px`)
    root.classList.add('theme-switching')

    document
      .startViewTransition(apply)
      .finished.finally(() => root.classList.remove('theme-switching'))
  }

  // Which icon shows is decided by CSS from the page's theme, so the button
  // is right on first paint without waiting for JavaScript.
  const icon =
    'absolute h-[1.05rem] w-[1.05rem] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch between light and dark theme"
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[.08] bg-white/70 text-zinc-700 transition-colors hover:border-black/20 hover:text-black dark:border-white/[.12] dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:border-white/30 dark:hover:text-zinc-50 ${className}`}
    >
      <Moon
        aria-hidden="true"
        className={`${icon} scale-100 rotate-0 opacity-100 dark:scale-0 dark:-rotate-90 dark:opacity-0`}
      />
      <Sun
        aria-hidden="true"
        className={`${icon} scale-0 rotate-90 opacity-0 dark:scale-100 dark:rotate-0 dark:opacity-100`}
      />
    </button>
  )
}
