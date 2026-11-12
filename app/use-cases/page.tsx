import type { Metadata } from 'next'
import MarketingShell, { SignupCta } from '@/app/components/marketing-shell'

export const metadata: Metadata = {
  title: 'Use cases — FolioQ',
  description:
    'How student funds, investment clubs, families, and classes use FolioQ to keep a portfolio and the reasoning behind it on record.',
}

const cases = [
  {
    who: 'Student-managed funds',
    situation:
      'The analysts who pitched a stock in spring have graduated by autumn. The new team inherits positions and a slide deck nobody can find.',
    fit: 'Every holding carries a written thesis, with earlier versions kept, so the handover is the portfolio itself. A faculty adviser or donor gets a read-only link and can look in between reports.',
  },
  {
    who: 'Investment clubs',
    situation:
      'Members vote at a monthly meeting, one person places the trades, and everyone else finds out how it went at the next meeting.',
    fit: 'The member who trades keeps the holdings current and writes up the argument the club agreed on. Everyone else opens the link whenever they like and sees holdings, value, and the reasoning.',
  },
  {
    who: 'Family money',
    situation:
      'You look after a parent’s account or a sibling’s savings. They trust you, and you would still rather they could see everything.',
    fit: 'Keep one portfolio per person and send each of them their link. Nothing they can tap will change anything, and you never share a brokerage password.',
  },
  {
    who: 'Classes and paper portfolios',
    situation:
      'A finance course asks each student to run a portfolio for a term and defend their decisions, and grading thirty spreadsheets is nobody’s idea of teaching.',
    fit: 'Students write a thesis for each position and submit a link. The instructor sees the same layout for every student: holdings, gains, and the claim, assumptions, and risks behind each one. A thesis left as an unedited AI draft is labelled as one.',
  },
  {
    who: 'Your own discipline',
    situation:
      'Nobody is asking you for an account of your portfolio, which is exactly why it is easy to stop being honest about it.',
    fit: 'Writing down what has to stay true before you buy is a cheap check on impulse. Reading it back a year later is the most direct feedback on your judgment you can get.',
  },
]

export default function UseCasesPage() {
  return (
    <MarketingShell
      title="Where a portfolio needs an explanation"
      lede="FolioQ is most useful when the person making the decisions is not the only person the decisions affect. These are the situations it fits best."
    >
      <div className="mt-16 flex flex-col divide-y divide-black/[.08] border-y border-black/[.08] sm:mt-20 dark:divide-white/[.1] dark:border-white/[.1]">
        {cases.map((c) => (
          <article key={c.who} className="grid gap-x-12 gap-y-4 py-10 md:grid-cols-[16rem_minmax(0,1fr)]">
            <h2 className="text-2xl leading-snug font-semibold text-black dark:text-zinc-50">
              {c.who}
            </h2>
            <div className="flex max-w-2xl flex-col gap-4 text-base leading-7">
              <p className="text-zinc-600 dark:text-zinc-400">{c.situation}</p>
              <p className="text-black dark:text-zinc-100">{c.fit}</p>
            </div>
          </article>
        ))}
      </div>

      <SignupCta />
    </MarketingShell>
  )
}
