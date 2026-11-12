import type { Metadata } from 'next'
import MarketingShell, { Section, SignupCta } from '@/app/components/marketing-shell'

export const metadata: Metadata = {
  title: 'About — FolioQ',
  description:
    'FolioQ is a portfolio tracker for people who answer to someone else for the money they manage.',
}

const principles = [
  {
    title: 'Write the thesis down while you still believe it.',
    body: 'Memory rewrites itself around outcomes. A thesis written when you took the position is the only version of your reasoning that hasn’t been edited by what happened next.',
  },
  {
    title: 'Name what would prove you wrong.',
    body: 'A claim alone is an opinion. Listing the assumptions it rests on and the risks you’re accepting turns it into something that can be checked later, by you or by anyone else.',
  },
  {
    title: 'Keep the old versions.',
    body: 'Changing your mind is fine. Pretending you always thought this is not. Every edit to a thesis is saved as a new version next to the ones before it.',
  },
  {
    title: 'Show your work without handing over the keys.',
    body: 'The people you answer to should be able to look whenever they like. They should not need your password to do it, and looking should never be able to change anything.',
  },
]

export default function AboutPage() {
  return (
    <MarketingShell
      title="For people who answer for someone else’s money"
      lede="FolioQ is a portfolio tracker built around one question that ordinary trackers don’t help with: when someone asks why you hold what you hold, what do you show them?"
    >
      <Section title="The problem with a spreadsheet">
        <p>
          A student fund, an investment club, a parent&apos;s retirement account, a class
          portfolio: each one has a person making decisions and other people who are owed an
          explanation. The usual tool is a spreadsheet that one person understands.
        </p>
        <p>
          It records what is held. It rarely records why, it is correct only as long as nobody
          mistypes a formula, and it leaves with the person who built it. When the treasurer
          graduates or the question finally gets asked, the reasoning is gone.
        </p>
      </Section>

      <Section title="What FolioQ holds to">
        <ul className="flex flex-col gap-7">
          {principles.map((p) => (
            <li key={p.title}>
              <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{p.title}</h3>
              <p className="mt-2">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Where AI fits">
        <p>
          FolioQ uses AI in two places: to draft a thesis you then rewrite, and to answer questions
          about a portfolio. Both are there to make you think harder, not to think for you. A
          draft you haven&apos;t edited is labelled as one, and the assistant won&apos;t tell you
          what to buy or sell.
        </p>
      </Section>

      <Section title="What FolioQ is not">
        <p>
          FolioQ is a record, not a broker and not an adviser. It never places an order, never
          holds money, and never tells you what to buy. The prices it shows come from a market
          data provider; everything else on the page comes from what you entered.
        </p>
        <p>
          That narrowness is deliberate. A tool that only keeps the record can be shown to anyone.
        </p>
      </Section>

      <SignupCta />
    </MarketingShell>
  )
}
