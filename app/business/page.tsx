import type { Metadata } from 'next'
import MarketingShell, { Section, SignupCta } from '@/app/components/marketing-shell'

export const metadata: Metadata = {
  title: 'For funds and clubs — FolioQ',
  description:
    'How a fund, club, or adviser can run FolioQ today: one person keeps the record, everyone else has a read-only link.',
}

const setup = [
  {
    title: 'One person keeps the record.',
    body: 'Usually the treasurer or portfolio manager. They create the portfolio under their account, keep its holdings current, and write up the thesis the group agreed on for each one.',
  },
  {
    title: 'Everyone else gets the link.',
    body: 'Members, advisers, donors, or clients open a read-only page with live holdings, value history, and the thesis for every position. No accounts to create, no seats to count.',
  },
  {
    title: 'Each mandate gets its own portfolio.',
    body: 'Run as many portfolios as you need — a growth sleeve and an income sleeve, or one per client — each with its own link, so people see only what concerns them.',
  },
  {
    title: 'Access ends when you say so.',
    body: 'Turn sharing off and the link is dead for everyone who had it. Turn it back on and a fresh link is issued for the people who should still have one.',
  },
]

const gaps = [
  'A portfolio has a single owner. Two people can’t both edit it from separate accounts.',
  'There are no roles or approval steps. Nothing stops the owner from changing a holding or a thesis the group hasn’t agreed to.',
  'Thesis versions are kept, but the owner can delete a holding and its theses with it. This is a working record, not a tamper-proof audit trail.',
  'There is no export to CSV or PDF yet. Reports are the shared page itself.',
]

export default function BusinessPage() {
  return (
    <MarketingShell
      title="Running a fund or a club on FolioQ"
      lede="FolioQ has no separate team product. This page shows how a group can use it as it stands today, and says plainly where it stops."
    >
      <Section title="How a group sets it up">
        <ul className="flex flex-col gap-7">
          {setup.map((step) => (
            <li key={step.title}>
              <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{step.title}</h3>
              <p className="mt-2">{step.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Where it stops">
        <p>
          If your group needs any of the following, FolioQ on its own is not enough yet, and it is
          better to know that before you move a fund onto it.
        </p>
        <ul className="flex flex-col gap-3">
          {gaps.map((gap) => (
            <li key={gap} className="border-l-2 border-black/15 pl-4 dark:border-white/20">
              {gap}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="A note for advisers">
        <p>
          FolioQ is a record-keeping and reporting tool. It is not a custodian, it is not a system
          of record for regulatory purposes, and nothing on a shared page is investment advice.
          If you are regulated, treat it as a client-friendly window onto records you keep
          properly elsewhere.
        </p>
      </Section>

      <SignupCta
        title="Try it with one fund"
        text="Create an account, enter what the fund holds and why, and send the link to the people you report to."
      />
    </MarketingShell>
  )
}
