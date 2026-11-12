import Link from 'next/link'
import { GuestOnly, MemberOnly } from '@/app/components/session'
import SiteFooter from '@/app/components/site-footer'
import SiteHeader from '@/app/components/site-header'

/** Page frame for the public pages: header, a left-aligned title block, footer. */
export default function MarketingShell({
  title,
  lede,
  children,
}: {
  title: string
  lede?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-14 sm:px-10 sm:pt-20">
        <header className="max-w-3xl">
          <h1 className="text-[2.6rem] leading-[1.06] text-balance text-black sm:text-6xl sm:leading-[1.04] dark:text-zinc-50">
            {title}
          </h1>
          {lede && (
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              {lede}
            </p>
          )}
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

/** A titled block of prose. Keeps line length comfortable. */
export function Section({
  title,
  children,
  wide = false,
}: {
  title?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <section className="mt-16 sm:mt-24">
      {title && (
        <h2 className="max-w-2xl text-3xl leading-[1.15] text-balance text-black sm:text-4xl dark:text-zinc-50">
          {title}
        </h2>
      )}
      <div
        className={`${title ? 'mt-5' : ''} ${wide ? '' : 'max-w-2xl'} flex flex-col gap-5 text-base leading-7 text-zinc-600 dark:text-zinc-400`}
      >
        {children}
      </div>
    </section>
  )
}

const onInkPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-mint-100'
const onInkOutline =
  'inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10'

/**
 * The closing panel on public pages. Signed-out visitors are invited to
 * create an account; signed-in visitors are pointed back to their portfolios.
 */
export function SignupCta({
  title = 'Start with one portfolio',
  text = 'Create an account, name the money you answer for, and add the first holding.',
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="relative mt-20 overflow-hidden rounded-[2.5rem] bg-black px-6 py-16 text-center sm:mt-28 sm:px-10 sm:py-20 dark:bg-zinc-900">
      <div aria-hidden="true" className="rings rings-on-ink pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center">
        <GuestOnly>
          <h2 className="text-4xl leading-[1.08] text-balance text-white sm:text-5xl">{title}</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">{text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={onInkPrimary}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-mint-500" />
              Create an account
            </Link>
            <Link href="/product" className={onInkOutline}>
              See how it works
            </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-500">Free, with no card on file.</p>
        </GuestOnly>
        <MemberOnly>
          <h2 className="text-4xl leading-[1.08] text-balance text-white sm:text-5xl">
            Your portfolios are where you left them
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">
            You&apos;re signed in. Pick up with the holdings and theses you already have on record.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard" className={onInkPrimary}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-mint-500" />
              Open your portfolios
            </Link>
            <Link href="/research" className={onInkOutline}>
              Research a ticker
            </Link>
          </div>
        </MemberOnly>
      </div>
    </section>
  )
}
