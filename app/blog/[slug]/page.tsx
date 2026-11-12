import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteFooter from '@/app/components/site-footer'
import SiteHeader from '@/app/components/site-header'
import { getPost, posts, type Block } from '@/lib/blog'
import { formatDate } from '@/lib/format'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return { title: `${post.title} — FolioQ`, description: post.summary }
}

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          key={index}
          className="mt-6 text-2xl leading-snug font-semibold text-black dark:text-zinc-50"
        >
          {block.text}
        </h2>
      )
    case 'list':
      return (
        <ul key={index} className="flex list-disc flex-col gap-3 pl-5 marker:text-zinc-400">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'example':
      return (
        <div
          key={index}
          className="overflow-x-auto rounded-2xl border border-black/[.08] bg-white dark:border-white/[.08] dark:bg-zinc-900"
        >
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {block.rows.map(([left, right]) => (
                <tr key={left}>
                  <th
                    scope="row"
                    className="px-5 py-3.5 text-left font-medium whitespace-nowrap text-black dark:text-zinc-50"
                  >
                    {left}
                  </th>
                  <td className="px-5 py-3.5 text-zinc-600 tabular-nums dark:text-zinc-400">
                    {right}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return <p key={index}>{block.text}</p>
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const others = posts.filter((p) => p.slug !== post.slug)

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-14 sm:px-10 sm:pt-20">
        <article className="max-w-2xl">
          <Link
            href="/blog"
            className="text-sm text-zinc-500 underline-offset-4 hover:text-black hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            All posts
          </Link>
          <h1 className="mt-5 text-4xl leading-[1.12] font-semibold text-balance text-black sm:text-5xl sm:leading-[1.1] dark:text-zinc-50">
            {post.title}
          </h1>
          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
            <time dateTime={post.date}>{formatDate(post.date)}</time>, {post.minutes} minute read
          </p>
          <div className="mt-10 flex flex-col gap-5 text-[1.05rem] leading-8 text-zinc-700 dark:text-zinc-300">
            {post.body.map(renderBlock)}
          </div>
        </article>

        {others.length > 0 && (
          <nav aria-label="More posts" className="mt-20 max-w-2xl border-t border-black/[.08] pt-8 dark:border-white/[.1]">
            <p className="text-sm font-medium text-black dark:text-zinc-50">Keep reading</p>
            <ul className="mt-4 flex flex-col gap-3">
              {others.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="text-base text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
