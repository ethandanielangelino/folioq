'use client'

import { useCallback, useRef, useSyncExternalStore } from 'react'

export interface TabSpec {
  id: string
  label: string
  /** Small count or status shown beside the label, e.g. "2 of 3". */
  badge?: string
  content: React.ReactNode
}

/** Fired on window to ask the tabs to switch, optionally scrolling to an element. */
const GO_EVENT = 'folioq:go-to-tab'

/**
 * Switch tab from anywhere on the page (a table row, a button inside another
 * tab). `focusId` is an element to scroll to and highlight once the tab shows.
 */
export function goToTab(tab: string, focusId?: string) {
  window.dispatchEvent(new CustomEvent(GO_EVENT, { detail: { tab, focusId } }))
}

function subscribe(onChange: () => void) {
  function onGo(event: Event) {
    const { tab, focusId } = (event as CustomEvent<{ tab: string; focusId?: string }>).detail
    history.replaceState(null, '', `#${tab}`)
    onChange()
    if (focusId) {
      // Wait for the panel to be shown before scrolling to something inside it.
      requestAnimationFrame(() => {
        const target = document.getElementById(focusId)
        if (!target) return
        target.scrollIntoView({ block: 'center' })
        target.animate(
          [
            { backgroundColor: 'color-mix(in oklab, var(--color-mint-400) 22%, transparent)' },
            { backgroundColor: 'transparent' },
          ],
          { duration: 1600, easing: 'ease-out' }
        )
      })
    }
  }
  window.addEventListener('hashchange', onChange)
  window.addEventListener(GO_EVENT, onGo)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener(GO_EVENT, onGo)
  }
}

/**
 * Tabs whose selection lives in the URL hash, so a reload or a shared link
 * lands on the same tab. Every panel stays mounted; switching only hides the
 * others, which keeps things like a half-typed question intact.
 */
export default function PortfolioTabs({ tabs, label }: { tabs: TabSpec[]; label: string }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => ''
  )
  const active = tabs.some((t) => t.id === hash) ? hash : tabs[0].id
  const listRef = useRef<HTMLDivElement>(null)

  const select = useCallback((id: string) => goToTab(id), [])

  function onKeyDown(event: React.KeyboardEvent) {
    const index = tabs.findIndex((t) => t.id === active)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    select(tabs[next].id)
    listRef.current?.querySelector<HTMLElement>(`#tab-${tabs[next].id}`)?.focus()
  }

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-6 bg-zinc-50/85 px-6 backdrop-blur-md sm:-mx-10 sm:px-10 lg:-mx-16 lg:px-16 dark:bg-black/80">
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="flex gap-1 overflow-x-auto border-b border-black/[.08] dark:border-white/[.1]"
        >
          {tabs.map((tab) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.id)}
                className={`relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'text-black dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      selected
                        ? 'bg-black/[.07] text-zinc-700 dark:bg-white/[.12] dark:text-zinc-200'
                        : 'bg-black/[.04] text-zinc-500 dark:bg-white/[.07] dark:text-zinc-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-mint-500 transition-opacity ${
                    selected ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className={tab.id === active ? 'animate-panel-in flex flex-col gap-6 pt-6' : undefined}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
