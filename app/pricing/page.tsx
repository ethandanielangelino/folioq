import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import MarketingShell, { Section } from '@/app/components/marketing-shell'
import { GuestOnly, MemberOnly } from '@/app/components/session'
import { primaryButton } from '@/app/components/styles'

export const metadata: Metadata = {
  title: 'Pricing — FolioQ',
  description: 'FolioQ is free. There are no paid plans.',
}

const included = [
  'As many portfolios as you need',
  'A written, versioned thesis for every holding',
  'Live prices for US-listed stocks and ETFs',
  'Values, gains, and allocation worked out for you',
  'Closing prices saved every market day for the value chart',
  'A read-only share link for each portfolio',
  'AI thesis drafts and a portfolio assistant',
]

const questions = [
  {
    q: 'Do I need a card to sign up?',
    a: 'No. An email address and a password is all it takes.',
  },
  {
    q: 'Do the people I share with need to pay or sign up?',
    a: 'No. A share link opens in any browser without an account.',
  },
  {
    q: 'Are there limits?',
    a: 'Prices and AI answers come from outside providers with their own rate limits. A very large portfolio may occasionally show a holding at cost until the next refresh, and the AI may ask you to try again in a minute. FolioQ covers US-listed stocks and ETFs, in US dollars.',
  },
  {
    q: 'Will there be paid plans?',
    a: 'There are none today. If that changes, this page will say so before anything is charged.',
  },
]

export default function PricingPage() {
  return (
    <MarketingShell
      title="FolioQ is free"
      lede="There is one plan and it costs nothing. Everything the product does is included."
    >
      <section className="mt-14 grid gap-x-12 gap-y-8 rounded-[2.5rem] border border-black/[.08] bg-white p-8 sm:mt-16 sm:p-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] dark:border-white/[.08] dark:bg-zinc-900">
        <div>
          <p className="text-8xl leading-none text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">$0</p>
          <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
            For every account, with no trial period and no card on file.
          </p>
          <GuestOnly>
            <Link href="/signup" className={`${primaryButton} mt-7 px-6 py-3`}>
              Create an account
            </Link>
          </GuestOnly>
          <MemberOnly>
            <Link href="/dashboard" className={`${primaryButton} mt-7 px-6 py-3`}>
              Open your portfolios
            </Link>
          </MemberOnly>
        </div>
        <ul className="flex flex-col gap-3.5 text-base text-zinc-700 dark:text-zinc-300">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <Check
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 text-black dark:text-zinc-50"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <Section title="Questions about cost">
        <dl className="flex flex-col gap-7">
          {questions.map((item) => (
            <div key={item.q}>
              <dt className="font-medium text-black dark:text-zinc-50">{item.q}</dt>
              <dd className="mt-2">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </MarketingShell>
  )
}
