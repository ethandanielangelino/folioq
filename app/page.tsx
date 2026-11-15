import Link from "next/link";
import {
  AssistantWidget,
  MathWidget,
  ShareWidget,
  ThesisWidget,
} from "@/app/components/home/feature-widgets";
import HeroStage from "@/app/components/home/hero-stage";
import { SignupCta } from "@/app/components/marketing-shell";
import { GuestOnly, MemberOnly } from "@/app/components/session";
import SiteFooter from "@/app/components/site-footer";
import SiteHeader from "@/app/components/site-header";
import { outlineButton, primaryButton, textLink } from "@/app/components/styles";

const features = [
  {
    title: "A written reason for every holding",
    body: "Each position gets a claim, the assumptions it rests on, and the risks you accept by holding it. Editing saves a new version and keeps the old one, so the record shows how your thinking moved.",
    try: "Switch between the AI draft and what the owner wrote over it.",
    link: { label: "How theses work", href: "/product" },
    widget: <ThesisWidget />,
  },
  {
    title: "Enter three numbers and the rest follows",
    body: "A ticker, a share count, and your average cost. Live prices give each holding its value, its weight in the portfolio, today’s move, and its gain against what you paid.",
    try: "Change a share count and watch the weights rebalance.",
    link: { label: "Look up a ticker", href: "/research" },
    widget: <MathWidget />,
  },
  {
    title: "An assistant that questions your reasoning",
    body: "It reads the portfolio’s holdings and theses, then tells you where you are concentrated, which thesis is thin, and what the people you report to will ask. It won’t tell you what to buy or sell.",
    try: "Ask it one of the questions a stakeholder would.",
    link: { label: "Where AI fits", href: "/about" },
    widget: <AssistantWidget />,
  },
  {
    title: "A link instead of a login",
    body: "Turn sharing on and the portfolio gets a private, read-only page. The people you answer to see holdings, values, and every thesis without an account, and nothing they tap can change anything.",
    try: "Turn sharing off, then on again.",
    link: { label: "Running a fund or club on FolioQ", href: "/business" },
    widget: <ShareWidget />,
  },
];

const steps = [
  {
    title: "Add what you hold",
    description:
      "A stock or fund, crypto, gold or silver, or cash, with how much you hold and what it cost. Live prices fill in value, weight, and gain.",
  },
  {
    title: "Write down why",
    description:
      "A claim, the assumptions it rests on, and the risks. Start from an AI draft if the blank page is in the way.",
  },
  {
    title: "Send the link",
    description:
      "The people you answer to see the holdings and the reasoning, read-only, without an account.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 sm:px-10">
        <section className="flex flex-col items-center pt-12 text-center sm:pt-16">
          <h1 className="max-w-4xl text-[3.1rem] leading-[1.02] text-balance text-black sm:text-7xl lg:text-[5.25rem] dark:text-zinc-50">
            Show them why you own it.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            FolioQ tracks what a portfolio holds and keeps the written reason for each position
            beside it, so the people you answer to can see both.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <GuestOnly>
              <Link href="/signup" className={`${primaryButton} px-7 py-3.5`}>
                Create an account
              </Link>
              <Link href="/product" className={`${outlineButton} px-7 py-3.5`}>
                See how it works
              </Link>
            </GuestOnly>
            <MemberOnly>
              <Link href="/dashboard" className={`${primaryButton} px-7 py-3.5`}>
                Open your portfolios
              </Link>
              <Link href="/research" className={`${outlineButton} px-7 py-3.5`}>
                Research a ticker
              </Link>
            </MemberOnly>
          </div>

          <div className="mt-14 w-full sm:mt-16">
            <HeroStage />
          </div>
        </section>

        <section className="mt-24 max-w-2xl sm:mt-32">
          <h2 className="text-3xl leading-[1.15] text-balance text-black sm:text-4xl dark:text-zinc-50">
            How it did is only half the question
          </h2>
          <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400">
            A student fund, an investment club, a parent&apos;s account: someone makes the
            decisions and someone else is owed an explanation. FolioQ keeps the answer to
            &ldquo;why do we own this?&rdquo; next to the position itself. Every panel below
            works, so try them.
          </p>
        </section>

        <div className="mt-12 flex flex-col gap-6 sm:mt-16">
          {features.map((feature, index) => (
            <section
              key={feature.title}
              className="grid items-center gap-x-12 gap-y-10 rounded-[2rem] bg-zinc-100/80 px-4 py-8 sm:rounded-[2.5rem] sm:px-10 sm:py-14 lg:grid-cols-2 dark:bg-zinc-900/50"
            >
              <div className={`min-w-0 px-2 sm:px-0 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                <h3 className="max-w-md text-2xl leading-[1.2] text-balance text-black [font-family:var(--font-serif),serif] sm:text-[1.75rem] dark:text-zinc-50">
                  {feature.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  {feature.body}
                </p>
                <p className="mt-5 max-w-md border-l-2 border-mint-500 pl-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {feature.try}
                </p>
                <p className="mt-6 text-sm">
                  <Link href={feature.link.href} className={textLink}>
                    {feature.link.label}
                  </Link>
                </p>
              </div>
              <div className={`min-w-0 ${index % 2 === 1 ? "lg:order-1" : ""}`}>{feature.widget}</div>
            </section>
          ))}
        </div>

        <section className="mt-24 sm:mt-32">
          <h2 className="max-w-2xl text-3xl leading-[1.15] text-balance text-black sm:text-4xl dark:text-zinc-50">
            From nothing to a link you can send
          </h2>
          <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="border-t border-black/[.12] pt-5 dark:border-white/[.15]">
                <span
                  aria-hidden="true"
                  className="text-4xl text-mint-600 [font-family:var(--font-serif),serif] dark:text-mint-400"
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-black dark:text-zinc-50">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <SignupCta />
      </main>

      <SiteFooter />
    </div>
  );
}
