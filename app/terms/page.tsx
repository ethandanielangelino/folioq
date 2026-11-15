import type { Metadata } from 'next'
import Link from 'next/link'
import MarketingShell, { Section } from '@/app/components/marketing-shell'
import { textLink } from '@/app/components/styles'
import { formatDate } from '@/lib/format'
import { CONTACT_EMAIL, TERMS_UPDATED } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms and privacy — FolioQ',
  description:
    'The terms for using FolioQ and what happens to the information you put into it, in plain language.',
}

const summary = [
  'FolioQ keeps a record of what you tell it. It is not a broker or an adviser, and nothing on it is investment advice.',
  'What you enter is yours. FolioQ stores it so it can show it back to you and to anyone you give a share link.',
  'Prices and AI answers come from outside providers and can be wrong. Decisions you make are your own.',
  'FolioQ is free. It has no adverts and does not sell your information.',
]

const terms = [
  {
    title: 'What FolioQ is',
    body: [
      'FolioQ is a record-keeping tool. You enter the holdings in a portfolio and the reason for each one, and FolioQ works out values and shows them back to you and to the people you choose to share with.',
      'FolioQ does not place orders, hold money, connect to a brokerage, or act as a custodian. It is not a financial adviser. Nothing FolioQ shows you, including anything written by its AI features, is a recommendation to buy, sell, or hold anything.',
    ],
  },
  {
    title: 'Your account',
    body: [
      'You need an account to keep portfolios. Give an email address you can receive mail at, keep your password to yourself, and tell us if you think someone else has got into your account. You are responsible for what is done through it.',
      'You must be at least 13 years old, and old enough to agree to these terms where you live. If you use FolioQ for a fund, club, class, or another person, you confirm that you are allowed to record their information here.',
    ],
  },
  {
    title: 'What you put in',
    body: [
      'Your portfolios, holdings, theses, and assistant conversations belong to you. You give FolioQ permission to store them, to display them to you, to display a portfolio to anyone who has its share link while sharing is on, and to send the relevant parts to the AI provider when you ask for a draft or use the assistant.',
      'You are responsible for what you write. Do not enter anything you have no right to share, and do not enter account numbers, passwords, or other secrets. FolioQ does not need them.',
    ],
  },
  {
    id: 'prices',
    title: 'Prices and other market data',
    body: [
      'Prices, company details, and news for listed shares and funds come from Finnhub; crypto prices from Coinbase (or Kraken), gold and silver prices from gold-api.com, and the value of cash from exchange-rate services. Any of them may be delayed, incomplete, unavailable, or wrong. Crypto trades around the clock, so its change for the day is measured over the last 24 hours. Values, gains, and weights are calculated from those prices and from the numbers you entered, so an error in either carries through. All prices in FolioQ are estimates and may not match the exact price you would buy or sell at.',
      'When you record a purchase or a sale, you give the date and FolioQ looks up the price: the live price for today, otherwise that day’s closing price, or the last close before it if markets were shut. Closing prices for shares and funds come from Yahoo Finance, for gold and silver from COMEX futures on Yahoo Finance (which track the spot price closely but are not the same), and for crypto from Coinbase or Kraken, by UTC day; if none of them answers, from the daily prices FolioQ saved itself. The price your broker gave you may differ, so the costs, cash, and gains recorded are estimates too. A purchase can be paid from, and a sale paid into, cash in any currency: the amount is converted at that day’s exchange rate (the live rate for today, the European Central Bank’s reference rate for earlier days). Only when no source has a price for the date can one be typed in, and the history shows it was entered by hand.',
      'You can choose the currency amounts are shown in. Shares, funds, and gold and silver are priced in US dollars and converted for display at the current exchange rate, which FolioQ names together with the site it came from. Crypto is priced directly in your currency where an exchange FolioQ uses trades the coin in it: Coinbase or Kraken for euros, pounds, yen, Swiss francs, Canadian and Australian dollars; Independent Reserve for Singapore, Australian, and New Zealand dollars; Luno for ringgit, rupiah, and rand. That price is the middle of the exchange’s best bid and offer, and is used only when the two are close together and the price is within 5% of the US-dollar price converted; otherwise, and for every other coin and currency, the US-dollar price is converted. Each holding names where its price came from. The 24-hour change of a coin priced directly is its move in the US-dollar market. Underneath, FolioQ records and calculates in US dollars, so a converted figure is an indication, not what you would receive on exchanging, and it applies today’s rate to costs you paid in the past.',
      'Do not rely on FolioQ as the official record of an account. Your broker’s statements are the record.',
    ],
  },
  {
    title: 'AI drafts and the assistant',
    body: [
      'FolioQ can draft a thesis and answer questions about a portfolio using a language model. A language model can state things that are false, out of date, or simply made up. Treat what it writes as a starting point to check, never as fact or advice.',
      'When you ask it to, the assistant can set up a change to your portfolio, such as a holding to add, a purchase or sale to record, or money in or out, as a form in the chat filled in from what you said. It never makes a change itself: nothing is saved until you check the form and confirm it, and you are responsible for what you confirm. It does not suggest changes you did not ask for.',
      'The assistant is built to explain and to question, not to advise. It is instructed never to recommend buying, selling, or holding anything, never to predict prices, and never to say what suits you. If it ever appears to, treat that as an error and not as advice.',
      'Its outside information is limited to Finnhub’s market data and recent headlines from a fixed list of established news publishers. When an answer relies on either, the sources are listed under it so you can check them yourself.',
      'A thesis saved without changes is labelled as an AI draft wherever it appears, including on shared links.',
    ],
  },
  {
    title: 'Sharing a portfolio',
    body: [
      'A portfolio is private unless you share it. You can share it in two ways. You can invite another FolioQ account by its share ID, as view-only or as an editor; they must accept, and an invite that goes unanswered for 7 days lapses. Or you can make its link public, in which case anyone who has the link can see the portfolio’s name, description, holdings, values, and theses without signing in, and cannot change anything.',
      'An editor can add, change, and remove holdings and theses in that portfolio. You remain responsible for what is in it, so invite as editors only people you trust to change it. You can change someone’s access or remove it at any time, and you can make a public link private again, which stops it working for everyone.',
      'FolioQ cannot control what someone does with what they saw while they had access.',
    ],
  },
  {
    title: 'Using FolioQ fairly',
    body: [
      'Do not use FolioQ to break the law, to mislead the people you report to, or to get at anyone else’s account or data. Do not try to overload it, copy its market data in bulk, or resell access to it.',
      'An account that does any of these may be suspended or closed.',
    ],
  },
  {
    title: 'Cost',
    body: [
      'FolioQ is free and there are no paid plans. If that ever changes, the pricing page will say so before anything is charged, and nothing you already use will start costing money without your agreement.',
    ],
  },
  {
    title: 'No guarantees',
    body: [
      'FolioQ is provided as it is. It may have faults, it may be unavailable at times, and features may change or be removed. We will try to give notice before anything significant goes away.',
      'As far as the law allows, FolioQ is not liable for investment losses, for decisions made using what it shows, or for data that is lost or wrong. Keep your own copy of anything you cannot afford to lose.',
    ],
  },
  {
    title: 'Leaving, and changes to these terms',
    body: [
      'You can stop using FolioQ at any time and delete your portfolios from inside the app.',
      'If these terms change, the date at the top of this page changes with them. Carrying on using FolioQ after a change means you accept the new version.',
    ],
  },
]

const stored = [
  {
    term: 'Your account',
    detail:
      'Your name and email address, and a share ID that FolioQ generates for you. If you sign in with Google, Google passes along the name and email on that account. Passwords are handled by Supabase, which stores them in scrambled form; nobody at FolioQ can read yours.',
  },
  {
    term: 'Your portfolios',
    detail:
      'Portfolio names and descriptions, the holdings you enter (what each one is, how much, its cost, and when you got it), every saved version of each thesis, your conversations with the assistant, and who each portfolio is shared with.',
  },
  {
    term: 'In your browser',
    detail:
      'A cookie that keeps you signed in, a cookie for your choice of currency, and your light or dark mode choice. FolioQ sets no advertising or tracking cookies.',
  },
]

const providers = [
  {
    term: 'Supabase',
    detail: 'Runs sign-in and the database. Everything listed above is stored there.',
  },
  {
    term: 'Finnhub',
    detail:
      'Supplies share and fund prices, company details and industries, and news. It is sent ticker symbols only, never who is asking.',
  },
  {
    term: 'Google Gemini',
    detail:
      'Writes thesis drafts and assistant answers. When you ask for either, it is sent that portfolio’s description, holdings, and theses, and your question. It is not sent your name or email.',
  },
  {
    term: 'Coinbase, Kraken, Independent Reserve, Luno, gold-api.com, and Yahoo Finance',
    detail:
      'Supply crypto prices (Coinbase, with Kraken as a backup, and in some currencies Independent Reserve or Luno for a price quoted directly in that currency), gold and silver prices (gold-api.com), and past closing prices (Yahoo Finance, Coinbase, Kraken). They are sent only the coin, metal, or ticker symbol and the currency, never who is asking.',
  },
  {
    term: 'Exchange-rate services',
    detail:
      'When you choose a currency other than US dollars, FolioQ fetches rates from fxratesapi.com or Coinbase, and the European Central Bank’s daily rate through Frankfurter. They are asked only for the rates; nothing about you or your portfolios is sent.',
  },
  {
    term: 'Vercel',
    detail:
      'Hosts the site. Like any web host it keeps routine server logs, such as IP address and time of request.',
  },
]

function Clauses({ items }: { items: { id?: string; title: string; body: string[] }[] }) {
  return (
    <div className="flex flex-col gap-9">
      {items.map((clause) => (
        <div key={clause.title} id={clause.id} className="scroll-mt-28">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{clause.title}</h3>
          <div className="mt-2 flex flex-col gap-3">
            {clause.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Definitions({ items }: { items: { term: string; detail: string }[] }) {
  return (
    <dl className="flex flex-col gap-5">
      {items.map((item) => (
        <div key={item.term} className="border-l-2 border-mint-500 pl-4">
          <dt className="font-medium text-black dark:text-zinc-50">{item.term}</dt>
          <dd className="mt-1">{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function TermsPage() {
  const contact = CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className={textLink}>
      {CONTACT_EMAIL}
    </a>
  ) : null

  return (
    <MarketingShell
      title="Terms of service and privacy policy"
      lede={`Last updated ${formatDate(TERMS_UPDATED)}. This page covers the rules for using FolioQ and what happens to the information you put into it.`}
    >
      <section className="stage relative mt-12 overflow-hidden rounded-[2.5rem] px-6 py-10 sm:mt-16 sm:px-12 sm:py-12">
        <div aria-hidden="true" className="rings pointer-events-none absolute inset-0" />
        <div className="relative">
          <h2 className="text-3xl leading-[1.15] text-black dark:text-zinc-50">The short version</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-4 text-base leading-7 text-zinc-800 md:grid-cols-2 dark:text-zinc-200">
            {summary.map((point) => (
              <li key={point} className="flex gap-3">
                <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-mint-600" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href="#terms" className={textLink}>
              Terms of service
            </a>
            <a href="#privacy" className={textLink}>
              Privacy policy
            </a>
          </p>
        </div>
      </section>

      <div id="terms" className="scroll-mt-28">
        <Section title="Terms of service">
          <p>
            These terms are an agreement between you and the people who run FolioQ
            (&ldquo;we&rdquo;). Creating an account means you accept them.
          </p>
          <Clauses items={terms} />
        </Section>
      </div>

      <div id="privacy" className="scroll-mt-28">
        <Section title="Privacy policy">
          <p>
            FolioQ keeps only what it needs to do its job. It has no adverts, it does not sell or
            rent your information, and it never asks for brokerage logins, bank details, or card
            numbers.
          </p>
        </Section>

        <Section title="What FolioQ stores">
          <Definitions items={stored} />
        </Section>

        <Section title="Who else handles it">
          <p>
            FolioQ relies on a few outside services. Each one receives only what it needs for
            its part.
          </p>
          <Definitions items={providers} />
        </Section>

        <Section title="What other people can see">
          <p>
            Someone with a public link sees the portfolio&apos;s name and description, its
            holdings and values, and the thesis for each holding. They do not see your name, your
            email address, your other portfolios, or your conversations with the assistant.
          </p>
          <p>
            Someone you invite by share ID sees the same portfolio, plus your name, so they know
            who is inviting them. You see their name when you look up their ID and in the list of
            people a portfolio is shared with. Nobody you share with sees your email address, your
            other portfolios, or your conversations with the assistant. Anyone who knows your
            share ID can see the name on your account and send you an invite; they get nothing
            else unless you accept.
          </p>
        </Section>

        <Section title="Changing or deleting your information">
          <p>
            You can edit or delete any holding, thesis, or portfolio from inside the app. Deleting
            a portfolio removes its holdings, its theses, and its assistant conversation. You can
            change your name and password in{' '}
            <Link href="/account" className={textLink}>
              account settings
            </Link>
            .
          </p>
          {contact && (
            <p>
              To close your account and have everything attached to it deleted, or to ask for a
              copy of what FolioQ holds about you, write to {contact}.
            </p>
          )}
        </Section>

        {contact && (
          <Section title="Questions">
            <p>Write to {contact} about anything on this page.</p>
          </Section>
        )}
      </div>
    </MarketingShell>
  )
}
