import Image from 'next/image'
import Link from 'next/link'
import { GuestOnly, MemberOnly } from '@/app/components/session'
import ThemeToggle from '@/app/components/theme-toggle'

const groups = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/product' },
      { label: 'Use cases', href: '/use-cases' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Research a ticker', href: '/research' },
    ],
  },
  {
    title: 'FolioQ',
    links: [
      { label: 'About', href: '/about' },
      { label: 'For funds and clubs', href: '/business' },
      { label: 'Blog', href: '/blog' },
      { label: 'Terms and privacy', href: '/terms' },
    ],
  },
]

// The account column depends on whether the visitor is signed in.
const guestLinks = [
  { label: 'Log in', href: '/login' },
  { label: 'Create an account', href: '/signup' },
]
const memberLinks = [
  { label: 'Your portfolios', href: '/dashboard' },
  { label: 'Account settings', href: '/account' },
]

const linkClass =
  'text-sm text-zinc-500 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'

function LinkList({ links }: { links: { label: string; href: string }[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={linkClass}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-black/[.07] sm:mt-28 dark:border-white/[.08]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:px-10">
        <div>
          <p className="flex items-center gap-2.5 text-base font-semibold text-black dark:text-zinc-50">
            <Image src="/FolioQ-logo.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
            FolioQ
          </p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            FolioQ records the holdings you enter. It does not place orders, hold money, or give
            investment advice.
          </p>
          <ThemeToggle className="mt-5" />
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <p className="text-sm font-medium text-black dark:text-zinc-50">{group.title}</p>
            <LinkList links={group.links} />
          </nav>
        ))}
        <nav aria-label="Account">
          <p className="text-sm font-medium text-black dark:text-zinc-50">Account</p>
          <GuestOnly>
            <LinkList links={guestLinks} />
          </GuestOnly>
          <MemberOnly>
            <LinkList links={memberLinks} />
          </MemberOnly>
        </nav>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pb-10 text-xs text-zinc-400 sm:px-10 dark:text-zinc-500">
        © {new Date().getFullYear()} FolioQ. All rights reserved. Market data provided by Finnhub.
      </div>
    </footer>
  )
}
