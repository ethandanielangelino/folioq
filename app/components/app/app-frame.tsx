'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Briefcase, LayoutGrid, PanelLeft, Search, UserRound, Users, X } from 'lucide-react'
import AccountMenu from '@/app/components/account-menu'
import ThemeToggle from '@/app/components/theme-toggle'

export interface FramePortfolio {
  id: string
  name: string
}

const SIDEBAR_KEY = 'folioq-sidebar'
/** How many portfolios are listed in the sidebar before "All portfolios" takes over. */
const LISTED = 6

const item =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] text-zinc-700 transition-colors hover:bg-black/[.05] aria-[current=page]:bg-mint-600/[.12] aria-[current=page]:font-medium aria-[current=page]:text-mint-800 dark:text-zinc-300 dark:hover:bg-white/[.07] dark:aria-[current=page]:bg-mint-400/[.14] dark:aria-[current=page]:text-mint-200'

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-black/[.06] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-50'

function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      aria-label="FolioQ home"
      className="flex items-center gap-2.5 rounded-full"
    >
      <Image src="/FolioQ-logo.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full" priority />
      <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">FolioQ</span>
    </Link>
  )
}

/** What the sidebar holds. Rendered in the fixed column on wide screens and in the drawer on small ones. */
function SidebarContent({
  user,
  portfolios,
  invites,
  onNavigate,
}: {
  user: { email: string; name: string | null }
  portfolios: FramePortfolio[]
  invites: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const inResearch = pathname.startsWith('/dashboard/research')
  const inShared = pathname.startsWith('/dashboard/shared')
  const inPortfolios =
    pathname === '/dashboard/portfolios' ||
    (pathname.startsWith('/dashboard/') && !inResearch && !inShared)

  const current = (active: boolean) => (active ? ('page' as const) : undefined)

  return (
    <>
      <nav aria-label="App" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        <Link href="/dashboard" onClick={onNavigate} aria-current={current(pathname === '/dashboard')} className={item}>
          <LayoutGrid className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          Home
        </Link>
        <Link
          href="/dashboard/portfolios"
          onClick={onNavigate}
          aria-current={current(pathname === '/dashboard/portfolios')}
          data-section={inPortfolios ? 'open' : undefined}
          className={item}
        >
          <Briefcase className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          Portfolios
        </Link>
        {portfolios.length > 0 && (
          <ul className="mb-1 ml-[1.35rem] flex flex-col gap-0.5 border-l border-black/[.1] pl-3 dark:border-white/[.12]">
            {portfolios.slice(0, LISTED).map((portfolio) => (
              <li key={portfolio.id}>
                <Link
                  href={`/dashboard/${portfolio.id}`}
                  onClick={onNavigate}
                  aria-current={current(pathname === `/dashboard/${portfolio.id}`)}
                  className="block truncate rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-black/[.05] hover:text-black aria-[current=page]:bg-mint-600/[.12] aria-[current=page]:font-medium aria-[current=page]:text-mint-800 dark:text-zinc-400 dark:hover:bg-white/[.07] dark:hover:text-zinc-50 dark:aria-[current=page]:bg-mint-400/[.14] dark:aria-[current=page]:text-mint-200"
                >
                  {portfolio.name}
                </Link>
              </li>
            ))}
            {portfolios.length > LISTED && (
              <li>
                <Link
                  href="/dashboard/portfolios"
                  onClick={onNavigate}
                  className="block rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  {portfolios.length - LISTED} more
                </Link>
              </li>
            )}
          </ul>
        )}
        <Link href="/dashboard/shared" onClick={onNavigate} aria-current={current(inShared)} className={item}>
          <Users className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          <span className="flex-1">Shared with me</span>
          {invites > 0 && (
            <span className="rounded-full bg-amber-deep px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
              {invites}
              <span className="sr-only">{invites === 1 ? ' invitation waiting' : ' invitations waiting'}</span>
            </span>
          )}
        </Link>
        <Link href="/dashboard/research" onClick={onNavigate} aria-current={current(inResearch)} className={item}>
          <Search className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          Research
        </Link>
        <Link href="/account" onClick={onNavigate} aria-current={current(pathname === '/account')} className={item}>
          <UserRound className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          Account
        </Link>
      </nav>

      <div className="border-t border-black/[.07] p-3 dark:border-white/[.08]">
        <AccountMenu email={user.email} name={user.name} variant="row" />
      </div>
    </>
  )
}

/**
 * The signed-in layout: a sidebar for getting around, a slim bar across the
 * top, and the page beside them. On small screens the sidebar becomes a
 * drawer opened from the top bar.
 */
export default function AppFrame({
  user,
  portfolios,
  invites,
  children,
}: {
  user: { email: string; name: string | null }
  portfolios: FramePortfolio[]
  invites: number
  children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  function toggleSidebar() {
    // Wide screens: show or hide the column, and remember it. The attribute
    // is restored before first paint by the script in session.tsx.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const root = document.documentElement
      const closing = root.getAttribute('data-sidebar') !== 'closed'
      if (closing) root.setAttribute('data-sidebar', 'closed')
      else root.removeAttribute('data-sidebar')
      try {
        localStorage.setItem(SIDEBAR_KEY, closing ? 'closed' : 'open')
      } catch {
        // Private browsing: the choice just isn't remembered.
      }
      return
    }
    setDrawerOpen(true)
  }

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <aside className="app-sidebar sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-black/[.07] bg-zinc-100/60 lg:flex dark:border-white/[.08] dark:bg-zinc-950">
        <div className="px-6 pt-5 pb-6">
          <Wordmark />
        </div>
        <SidebarContent user={user} portfolios={portfolios} invites={invites} />
      </aside>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,85vw)] flex-col bg-zinc-50 shadow-2xl transition-transform duration-200 ease-out outline-none data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full lg:hidden dark:bg-zinc-950">
            <div className="flex items-center justify-between px-5 pt-4 pb-5">
              <Dialog.Title render={<div />}>
                <span className="sr-only">Menu</span>
                <Wordmark onNavigate={() => setDrawerOpen(false)} />
              </Dialog.Title>
              <Dialog.Close aria-label="Close menu" className={iconButton}>
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <SidebarContent
              user={user}
              portfolios={portfolios}
              invites={invites}
              onNavigate={() => setDrawerOpen(false)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Show or hide the menu"
              title="Show or hide the menu"
              className={iconButton}
            >
              <PanelLeft className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
            </button>
            {/* The sidebar carries the name on wide screens; this is for when it is hidden. */}
            <div className="app-topmark">
              <Wordmark />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action="/dashboard/research" method="get" role="search" className="relative hidden sm:block">
              <label htmlFor="quick-lookup" className="sr-only">
                Look up a ticker
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="quick-lookup"
                type="search"
                name="q"
                required
                maxLength={40}
                autoComplete="off"
                placeholder="Look up a ticker"
                className="h-9 w-48 rounded-full border border-black/[.08] bg-white/70 pr-4 pl-9 text-sm text-black transition-[width,border-color] outline-none placeholder:text-zinc-400 focus-visible:w-64 focus-visible:border-mint-600 dark:border-white/[.12] dark:bg-zinc-900/70 dark:text-zinc-50 dark:focus-visible:border-mint-400"
              />
            </form>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-4 pb-14 sm:px-10 sm:pt-6 lg:px-16">
          {children}
        </main>
      </div>
    </div>
  )
}
