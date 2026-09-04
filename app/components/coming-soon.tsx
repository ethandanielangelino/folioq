import SiteHeader from "@/app/components/site-header";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-10 sm:py-24 lg:px-16">
        <span className="rounded-full border border-black/[.08] px-4 py-1.5 text-xs font-medium text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          {title}
        </span>
        <h1 className="mt-6 max-w-2xl text-4xl font-semibold text-black sm:text-5xl dark:text-zinc-50">
          Coming soon
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          We&apos;re still building this page. Check back soon.
        </p>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-center text-xs text-zinc-400 dark:text-zinc-500 sm:px-10 lg:px-16">
        © {new Date().getFullYear()} FolioQ. All rights reserved.
      </footer>
    </div>
  );
}
