'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const navLinks = [
  { label: 'About', href: '/about' },
  { label: 'Product', href: '/product' },
  { label: 'Research', href: '/research' },
  { label: 'Business', href: '/business' },
  { label: 'Use Cases', href: '/use-cases' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
]

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="sticky top-0.5 z-50 px-4 pt-0.5 sm:px-6 lg:px-8">
      <header
        className={`mx-auto flex w-full max-w-[85rem] items-center justify-between rounded-2xl border px-6 py-4 transition-all duration-300 sm:px-8 sm:py-5 ${
          scrolled
            ? 'border-black/[.08] bg-zinc-50/90 shadow-sm backdrop-blur-md dark:border-white/[.08] dark:bg-black/80'
            : 'border-black/[.06] bg-zinc-50/70 backdrop-blur-sm dark:border-white/[.06] dark:bg-black/50'
        }`}
      >
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/FolioQ-logo.png"
              alt="FolioQ"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
              FolioQ
            </span>
          </Link>
          <nav className="hidden items-center gap-9 text-sm font-medium text-zinc-600 md:flex dark:text-zinc-400">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-black dark:hover:text-zinc-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/login"
          className="rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Log in
        </Link>
      </header>
    </div>
  )
}
