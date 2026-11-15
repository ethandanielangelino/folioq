import { card } from '@/app/components/styles'
import type { Holding } from '@/lib/data'
import { formatDate, formatPercent, marketDate } from '@/lib/format'
import type { Thesis } from '@/lib/types'

function savedOn(thesis: Thesis): string {
  return formatDate(marketDate(new Date(thesis.createdAt)))
}

function Provenance({ thesis }: { thesis: Thesis }) {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Version {thesis.version}, saved {savedOn(thesis)}.{' '}
      {thesis.authorEdited ? (
        'Written by the owner.'
      ) : (
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          AI draft (Google&apos;s Gemini), saved without changes.
        </span>
      )}
    </p>
  )
}

function Points({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-black dark:text-zinc-50">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-6 text-zinc-700 marker:text-mint-500 dark:text-zinc-300">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One block per holding: the claim for owning it, the assumptions it rests
 * on, and the risks. `actions` lets the owner's view add controls per holding.
 */
export default function ThesisList({
  holdings,
  actions,
}: {
  holdings: Holding[]
  /** Per-holding controls for the owner, keyed by holding id. */
  actions?: Record<string, React.ReactNode>
}) {
  const missing = holdings.filter((h) => !h.thesis).length

  return (
    <section className={`${card} min-w-0 overflow-hidden`}>
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-xl text-black dark:text-zinc-50">Theses</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Why each position is held, what has to stay true, and what could go wrong.
          {holdings.length > 0 &&
            (missing === 0
              ? ' Every holding has one.'
              : ` ${missing} of ${holdings.length} holdings ${missing === 1 ? 'has' : 'have'} none yet.`)}
        </p>
      </div>

      {holdings.length === 0 ? (
        <p className="px-6 pb-8 text-sm text-zinc-500 dark:text-zinc-400">
          Theses appear here once there are holdings.
        </p>
      ) : (
        <ol className="divide-y divide-black/[.06] border-t border-black/[.06] dark:divide-white/[.08] dark:border-white/[.08]">
          {holdings.map((h) => (
            <li
              key={h.id}
              id={`thesis-${h.id}`}
              className="grid scroll-mt-20 gap-x-8 gap-y-4 px-6 py-6 md:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <div>
                <h3 className="text-xl font-semibold text-black dark:text-zinc-50">{h.ticker}</h3>
                {h.name && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{h.name}</p>
                )}
                <p className="mt-2 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {formatPercent(h.weight)} of the portfolio
                </p>
              </div>

              <div className="min-w-0">
                {h.thesis ? (
                  <>
                    <p className="max-w-prose border-l-2 border-mint-500 pl-4 text-[1.05rem] leading-8 text-zinc-800 [font-family:var(--font-serif),serif] dark:text-zinc-200">
                      {h.thesis.claim}
                    </p>
                    <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                      <Points
                        title="Assumptions"
                        items={h.thesis.assumptions}
                        empty="None listed."
                      />
                      <Points title="Risks" items={h.thesis.risks} empty="None listed." />
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                      <Provenance thesis={h.thesis} />
                      {actions?.[h.id]}
                    </div>

                    {h.thesisHistory.length > 0 && (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer rounded text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400">
                          {h.thesisHistory.length === 1
                            ? '1 earlier version'
                            : `${h.thesisHistory.length} earlier versions`}
                        </summary>
                        <ol className="mt-3 flex flex-col gap-4 border-l border-black/10 pl-4 dark:border-white/15">
                          {h.thesisHistory.map((old) => (
                            <li key={old.id}>
                              <Provenance thesis={old} />
                              <p className="mt-1 max-w-prose text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                                {old.claim}
                              </p>
                              {(old.assumptions.length > 0 || old.risks.length > 0) && (
                                <p className="mt-1 max-w-prose text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                                  {old.assumptions.length > 0 &&
                                    `Assumptions: ${old.assumptions.join('; ')}. `}
                                  {old.risks.length > 0 && `Risks: ${old.risks.join('; ')}.`}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No thesis written. Nothing on record says why this is held.
                    </p>
                    {actions?.[h.id]}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
