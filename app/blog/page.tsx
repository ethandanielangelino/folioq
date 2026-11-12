import type { Metadata } from 'next'
import Link from 'next/link'
import MarketingShell from '@/app/components/marketing-shell'
import { posts } from '@/lib/blog'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Blog — FolioQ',
  description: 'Notes on keeping an honest record of a portfolio, and on how FolioQ works.',
}

export default function BlogPage() {
  return (
    <MarketingShell
      title="Notes on keeping the record"
      lede="Short pieces on writing down why you hold what you hold, on using AI drafts honestly, and on how FolioQ’s numbers are calculated."
    >
      <ul className="mt-14 flex flex-col divide-y divide-black/[.08] border-y border-black/[.08] sm:mt-16 dark:divide-white/[.1] dark:border-white/[.1]">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group grid gap-x-12 gap-y-3 py-9 md:grid-cols-[11rem_minmax(0,1fr)]"
            >
              <p className="pt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span className="block">{post.minutes} minute read</span>
              </p>
              <div className="max-w-2xl">
                <h2 className="text-2xl leading-snug font-semibold text-black underline-offset-4 group-hover:underline dark:text-zinc-50">
                  {post.title}
                </h2>
                <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  {post.summary}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </MarketingShell>
  )
}
