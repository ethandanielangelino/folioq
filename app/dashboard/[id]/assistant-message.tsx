'use client'

import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUpRight } from 'lucide-react'
import { splitSources, type AssistantSource } from '@/lib/assistant-format'

/**
 * One assistant answer, typeset: paragraphs, lists, tables, and bold from the
 * model's Markdown, numbered citations that open their source, and the list
 * of sources underneath.
 *
 * Links are only ever made by this component, from sources the server
 * attached. A web address the model writes on its own stays plain text.
 */

const SOURCE_HREF = '#source-'

const cell = 'border-b border-black/[.07] px-3 py-2 text-left align-top dark:border-white/[.1]'

function components(sources: AssistantSource[]): Components {
  const byNumber = new Map(sources.map((s) => [String(s.n), s]))
  const heading: Components['h1'] = ({ children }) => (
    <p className="font-semibold text-black dark:text-zinc-50">{children}</p>
  )

  return {
    p: ({ children }) => <p className="leading-6">{children}</p>,
    ul: ({ children }) => (
      <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-mint-500">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-zinc-500">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-0.5 leading-6">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-black dark:text-zinc-50">{children}</strong>
    ),
    em: ({ children }) => <span>{children}</span>,
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    hr: () => null,
    img: () => null,
    code: ({ children }) => <span>{children}</span>,
    pre: ({ children }) => <p className="leading-6">{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-mint-500 pl-3 text-zinc-700 dark:text-zinc-300">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-[0.8125rem] tabular-nums">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className={`${cell} text-xs font-medium text-zinc-500 dark:text-zinc-400`}>{children}</th>
    ),
    td: ({ children }) => <td className={cell}>{children}</td>,
    a: ({ href, children }) => {
      const source = href?.startsWith(SOURCE_HREF) ? byNumber.get(href.slice(SOURCE_HREF.length)) : null
      if (!source) return <span>{children}</span>
      return (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${source.publisher}: ${source.title}`}
          aria-label={`Source ${source.n}: ${source.publisher}`}
          className="inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-full bg-mint-100 px-1 text-[0.68rem] font-semibold text-mint-800 no-underline transition-colors hover:bg-mint-200 dark:bg-mint-900/70 dark:text-mint-200 dark:hover:bg-mint-800"
        >
          {source.n}
        </a>
      )
    },
  }
}

function AssistantMessage({ content }: { content: string }) {
  const { body, sources } = splitSources(content)
  const numbers = new Set(sources.map((s) => s.n))
  // "[2]" becomes a link the renderer above turns into a numbered chip.
  // The no-break space keeps a chip from wrapping onto a line by itself.
  const text = body.replace(/ ?\[(\d+)\]/g, (whole, digits: string) =>
    numbers.has(Number(digits)) ? `\u00a0[${digits}](${SOURCE_HREF}${digits})` : whole
  )

  return (
    <>
      <div className="flex flex-col gap-3">
        <Markdown remarkPlugins={[remarkGfm]} components={components(sources)}>
          {text}
        </Markdown>
      </div>

      {sources.length > 0 && (
        <div className="mt-4 border-t border-black/[.07] pt-3 dark:border-white/[.1]">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sources</p>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {sources.map((source) => (
              <li key={source.n} className="flex gap-2 text-xs leading-5">
                <span className="mt-px flex h-[1.15rem] min-w-[1.15rem] shrink-0 items-center justify-center rounded-full bg-mint-100 px-1 text-[0.68rem] font-semibold text-mint-800 dark:bg-mint-900/70 dark:text-mint-200">
                  {source.n}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group min-w-0 text-zinc-600 dark:text-zinc-400"
                >
                  <span className="font-medium text-black dark:text-zinc-100">
                    {source.publisher}
                  </span>
                  {': '}
                  <span className="underline-offset-2 group-hover:underline">{source.title}</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="ml-0.5 inline h-3 w-3 -translate-y-px text-zinc-400"
                  />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

// Saved answers never change, so they are not re-typeset while a new one streams in.
export default memo(AssistantMessage)
