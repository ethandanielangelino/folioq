import Link from "next/link";
import SiteHeader from "@/app/components/site-header";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 py-16 text-center sm:px-10 sm:py-24 lg:px-16">
        <h1 className="max-w-2xl text-4xl font-semibold text-black sm:text-5xl dark:text-zinc-50">
          Track your investments with clarity.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          FolioQ helps you build, monitor, and understand your investment
          portfolios in one place — from real-time quotes to long-term
          performance, without the noise.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-black/[.08] px-6 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-100 dark:hover:bg-white/[.06]"
          >
            Log in
          </Link>
        </div>

        <div className="mt-24 grid w-full gap-6 text-left sm:grid-cols-3">
          <FeatureCard
            title="Portfolio tracking"
            description="See every holding, allocation, and gain or loss in one clean dashboard that updates as the market moves."
          />
          <FeatureCard
            title="Real-time quotes"
            description="Prices pulled straight from the market, so you're always looking at current data, not yesterday's close."
          />
          <FeatureCard
            title="Built to share"
            description="Invite classmates, collaborators, or clients to view a portfolio without handing over the keys."
          />
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-center text-xs text-zinc-400 dark:text-zinc-500 sm:px-10 lg:px-16">
        © {new Date().getFullYear()} FolioQ. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}
