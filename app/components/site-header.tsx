'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { GuestOnly, MemberOnly } from '@/app/components/session'
import { primaryButton } from '@/app/components/styles'
import ThemeToggle from '@/app/components/theme-toggle'

const navLinks = [
  { label: 'Product', href: '/product' },
  { label: 'Research', href: '/research' },
  { label: 'Use cases', href: '/use-cases' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
]

// Shown in the small-screen menu only; on wide screens these live in the footer.
const moreLinks = [
  { label: 'About', href: '/about' },
  { label: 'For funds and clubs', href: '/business' },
]

const navLink =
  'rounded-full px-3.5 py-2 transition-colors hover:bg-black/[.05] hover:text-black aria-[current=page]:text-black dark:hover:bg-white/[.08] dark:hover:text-zinc-50 dark:aria-[current=page]:text-zinc-50'

export default function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  // Remember which page the menu was opened on, so navigating closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === pathname

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="sticky top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4">
      <header
        className={`mx-auto w-full max-w-6xl border transition-[background-color,box-shadow,border-color] duration-300 ${
          menuOpen ? 'rounded-[1.75rem]' : 'rounded-full'
        } ${
          scrolled || menuOpen
            ? 'border-black/[.08] bg-zinc-50/90 shadow-lg shadow-black/[.06] backdrop-blur-md dark:border-white/[.1] dark:bg-zinc-950/85 dark:shadow-black/40'
            : 'border-black/[.06] bg-zinc-100/70 backdrop-blur-sm dark:border-white/[.08] dark:bg-zinc-900/60'
        }`}
      >
        <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4 sm:pl-5">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 rounded-full">
              <Image
                src="/FolioQ-logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
                priority
              />
              <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
                FolioQ
              </span>
            </Link>
            <nav
              aria-label="Main"
              className="hidden items-center text-sm font-medium text-zinc-600 lg:flex dark:text-zinc-400"
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isCurrent(link.href) ? 'page' : undefined}
                  className={navLink}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle className="mr-1 hidden min-[420px]:flex" />
            <GuestOnly>
              <Link
                href="/login"
                className={`${navLink} hidden text-sm font-medium text-zinc-700 sm:inline-flex dark:text-zinc-300`}
              >
                Log in
              </Link>
              <Link href="/signup" className={primaryButton}>
                Create account
              </Link>
            </GuestOnly>
            <MemberOnly>
              <Link href="/dashboard" className={primaryButton}>
                Open dashboard
              </Link>
            </MemberOnly>
            <button
              type="button"
              onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-black/[.05] lg:hidden dark:text-zinc-200 dark:hover:bg-white/[.08]"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="site-menu"
            aria-label="Main"
            className="animate-menu-in border-t border-black/[.06] px-3 py-3 lg:hidden dark:border-white/[.08]"
          >
            <ul className="grid grid-cols-2 gap-1">
              {[...navLinks, ...moreLinks].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isCurrent(link.href) ? 'page' : undefined}
                    onClick={() => setMenuOpenOn(null)}
                    className="block rounded-2xl px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] aria-[current=page]:text-black dark:text-zinc-300 dark:hover:bg-white/[.06] dark:aria-[current=page]:text-zinc-50"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <GuestOnly>
                <li className="sm:hidden">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpenOn(null)}
                    className="block rounded-2xl px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                  >
                    Log in
                  </Link>
                </li>
              </GuestOnly>
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-black/[.06] px-4 pt-3 min-[420px]:hidden dark:border-white/[.08]">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Light or dark</span>
              <ThemeToggle />
            </div>
          </nav>
        )}
      </header>
    </div>
  )
}
