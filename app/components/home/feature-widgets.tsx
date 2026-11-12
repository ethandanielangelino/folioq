'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Eye, Minus, Plus, Sparkles } from 'lucide-react'
import MiniWindow from '@/app/components/home/mini-window'
import AnimatedNumber from '@/app/components/motion/animated-number'
import Wiggle from '@/app/components/motion/wiggle'
import Delta from '@/app/components/portfolio/delta'
import { formatDate, formatMoney, formatPercent, marketDate } from '@/lib/format'
import { computeTotals, valueHoldings, type PriceQuote } from '@/lib/portfolio'
import { sampleHoldings } from '@/lib/sample'

/** Every widget is a window you can pick up; it shakes when it scrolls into view. */
function Widget({ children }: { children: React.ReactNode }) {
  return (
    <Wiggle draggable shakeOnView tilt={3} className="mx-auto w-full max-w-md">
      {children}
    </Wiggle>
  )
}

const pill = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-black text-white dark:bg-white dark:text-black'
      : 'text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'
  }`

/* ------------------------------------------------------------------ */
/* 1. A thesis and its earlier version                                 */
/* ------------------------------------------------------------------ */

const versioned = sampleHoldings.find((h) => h.thesis && h.thesisHistory.length > 0)
const versions = versioned?.thesis ? [...versioned.thesisHistory, versioned.thesis] : []

export function ThesisWidget() {
  const [shown, setShown] = useState(versions.length - 1)
  const thesis = versions[shown]
  if (!versioned || !thesis) return null

  return (
    <Widget>
      <MiniWindow title={`${versioned.ticker} thesis`} mat="mint">
        <div className="p-5">
          <div
            role="radiogroup"
            aria-label="Thesis version"
            className="inline-flex gap-0.5 rounded-full border border-black/[.08] p-0.5 dark:border-white/[.12]"
          >
            {versions.map((version, i) => (
              <button
                key={version.id}
                type="button"
                role="radio"
                aria-checked={i === shown}
                onClick={() => setShown(i)}
                className={pill(i === shown)}
              >
                Version {version.version}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="mt-4 min-h-[17.5rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={thesis.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <p
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    thesis.authorEdited
                      ? 'bg-mint-100 text-mint-800 dark:bg-mint-900/60 dark:text-mint-200'
                      : 'bg-amber-tint/60 text-black dark:bg-amber-deep/25 dark:text-amber-tint'
                  }`}
                >
                  {!thesis.authorEdited && <Sparkles className="h-3 w-3" aria-hidden="true" />}
                  {thesis.authorEdited ? 'Written by the owner' : 'AI draft, saved without changes'}
                </p>
                <p className="mt-3 border-l-2 border-mint-500 pl-4 text-[1.05rem] leading-7 text-zinc-900 [font-family:var(--font-serif),serif] dark:text-zinc-100">
                  {thesis.claim}
                </p>
                <p className="mt-4 text-xs font-medium text-black dark:text-zinc-50">
                  What has to stay true
                </p>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm leading-6 text-zinc-700 marker:text-mint-500 dark:text-zinc-300">
                  {thesis.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Saved {formatDate(marketDate(new Date(thesis.createdAt)))}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </MiniWindow>
    </Widget>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Change a share count, watch the rest follow                      */
/* ------------------------------------------------------------------ */

const quotes: Record<string, PriceQuote> = Object.fromEntries(
  sampleHoldings.map((h) => [
    h.ticker,
    { price: h.price ?? 0, change: h.quantity > 0 ? (h.dayChange ?? 0) / h.quantity : 0 },
  ])
)
const stepFor = (quantity: number) => Math.max(1, Math.round(quantity / 6))

export function MathWidget() {
  const [shares, setShares] = useState<Record<string, number>>(() =>
    Object.fromEntries(sampleHoldings.map((h) => [h.id, h.quantity]))
  )

  const valued = valueHoldings(
    sampleHoldings.map((h) => ({ ...h, quantity: shares[h.id] })),
    quotes
  )
  const totals = computeTotals(valued)
  const byId = new Map(valued.map((h) => [h.id, h]))
  const changed = sampleHoldings.some((h) => shares[h.id] !== h.quantity)

  function adjust(id: string, original: number, direction: 1 | -1) {
    const step = stepFor(original)
    setShares((current) => ({
      ...current,
      [id]: Math.min(original * 3, Math.max(step, current[id] + direction * step)),
    }))
  }

  const stepper =
    'flex h-7 w-7 items-center justify-center rounded-full border border-black/[.1] text-zinc-700 transition-colors hover:bg-black/[.05] disabled:opacity-30 dark:border-white/[.15] dark:text-zinc-200 dark:hover:bg-white/[.08]'

  return (
    <Widget>
      <MiniWindow title="Campus Value Fund" mat="sky">
        <div className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Market value</p>
              <p className="mt-0.5 text-3xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
                <AnimatedNumber value={totals.marketValue} format={formatMoney} />
              </p>
            </div>
            <p className="pb-1 text-xs tabular-nums">
              <Delta amount={totals.gain} ratio={totals.gainPct} />
            </p>
          </div>

          <ul className="mt-5 flex flex-col gap-4">
            {sampleHoldings.map((original) => {
              const h = byId.get(original.id)
              if (!h) return null
              const step = stepFor(original.quantity)
              return (
                <li key={h.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="w-12 text-sm font-semibold text-black sm:w-14 dark:text-zinc-50">
                      {h.ticker}
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjust(h.id, original.quantity, -1)}
                        disabled={h.quantity <= step}
                        aria-label={`Hold fewer ${h.ticker} shares`}
                        className={stepper}
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-10 text-center text-xs text-zinc-600 tabular-nums sm:w-20 dark:text-zinc-300">
                        {h.quantity}
                        <span className="sr-only sm:not-sr-only"> shares</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => adjust(h.id, original.quantity, 1)}
                        disabled={h.quantity >= original.quantity * 3}
                        aria-label={`Hold more ${h.ticker} shares`}
                        className={stepper}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                    <span className="w-14 text-right text-sm font-medium text-black tabular-nums sm:w-16 dark:text-zinc-50">
                      <AnimatedNumber value={h.weight} format={formatPercent} />
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]"
                  >
                    <motion.div
                      className="h-full rounded-full bg-[var(--viz-series)]"
                      initial={false}
                      animate={{ width: `${h.weight * 100}%` }}
                      transition={{ type: 'spring', stiffness: 170, damping: 24 }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="mt-5 flex min-h-5 items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Press + or − on any holding.</span>
            {changed && (
              <button
                type="button"
                onClick={() =>
                  setShares(Object.fromEntries(sampleHoldings.map((h) => [h.id, h.quantity])))
                }
                className="rounded font-medium text-black underline underline-offset-4 dark:text-zinc-50"
              >
                Reset
              </button>
            )}
          </p>
        </div>
      </MiniWindow>
    </Widget>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Ask the assistant                                                */
/* ------------------------------------------------------------------ */

const top = sampleHoldings[0]
const unexplained = sampleHoldings.find((h) => !h.thesis)

const exchanges = [
  {
    question: 'Where is the fund most concentrated?',
    answer: `${top.ticker} is ${formatPercent(top.weight)} of the fund. Its own thesis caps it at 45% and lists “one bad quarter moves everything” as a risk. You are inside the cap with very little room left.`,
  },
  {
    question: 'Which thesis is weakest?',
    answer:
      'KO’s. It assumes price increases keep sticking, and its second risk is shoppers trading down if prices keep rising. That is one bet written down twice. What would you see first if it stopped being true?',
  },
  ...(unexplained
    ? [
        {
          question: 'What will our adviser ask first?',
          answer: `Probably why ${unexplained.ticker} is ${formatPercent(unexplained.weight)} of the fund with no thesis on record. It was opened on ${formatDate(unexplained.openedAt)} and nothing says why. Write that one before the meeting.`,
        },
      ]
    : []),
]

export function AssistantWidget() {
  // Opens on the first question so the window is never empty.
  const [asked, setAsked] = useState<number | null>(0)
  const [thinking, setThinking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function ask(i: number) {
    if (timer.current) clearTimeout(timer.current)
    setAsked(i)
    setThinking(true)
    timer.current = setTimeout(() => setThinking(false), 750)
  }

  const exchange = asked === null ? null : exchanges[asked]

  return (
    <Widget>
      <MiniWindow title="Assistant" mat="amber">
        <div className="flex min-h-[21rem] flex-col p-5">
          <div aria-live="polite" className="flex flex-1 flex-col justify-end gap-3">
            {exchange ? (
              <>
                <motion.p
                  key={`q-${asked}`}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="ml-8 self-end rounded-2xl rounded-br-md bg-black px-4 py-2.5 text-sm leading-6 text-white dark:bg-white dark:text-black"
                >
                  {exchange.question}
                </motion.p>
                <div className="mr-6 self-start rounded-2xl rounded-bl-md bg-black/[.045] px-4 py-2.5 text-sm leading-6 text-zinc-800 dark:bg-white/[.07] dark:text-zinc-200">
                  {thinking ? (
                    <span className="flex h-6 items-center gap-1" role="status" aria-label="Thinking">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="h-1.5 w-1.5 rounded-full bg-zinc-500"
                          animate={{ opacity: [0.25, 1, 0.25] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }}
                        />
                      ))}
                    </span>
                  ) : (
                    <motion.span
                      key={`a-${asked}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35 }}
                    >
                      {exchange.answer}
                    </motion.span>
                  )}
                </div>
              </>
            ) : (
              <p className="pb-2 text-center text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Pick a question to see how it answers.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
            {exchanges.map((item, i) => (
              <button
                key={item.question}
                type="button"
                onClick={() => ask(i)}
                aria-pressed={asked === i}
                className={`rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                  asked === i
                    ? 'border-black bg-black/[.04] text-black dark:border-white dark:bg-white/[.08] dark:text-zinc-50'
                    : 'border-black/[.12] text-zinc-700 hover:border-black/40 dark:border-white/[.15] dark:text-zinc-300 dark:hover:border-white/50'
                }`}
              >
                {item.question}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.7rem] leading-4 text-zinc-500 dark:text-zinc-400">
            A scripted example. The real assistant reads your own holdings and theses, and it can
            be wrong.
          </p>
        </div>
      </MiniWindow>
    </Widget>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Turn sharing on and off                                          */
/* ------------------------------------------------------------------ */

const sampleLinks = ['q7x2m4kd', 'h3n8v1rt', 'c5k9w2pa']

export function ShareWidget() {
  const [on, setOn] = useState(true)
  // Counts how many times sharing has been switched back on: each time is a new link.
  const [issued, setIssued] = useState(0)
  const link = `/share/${sampleLinks[issued % sampleLinks.length]}`

  function toggle() {
    if (!on) setIssued((count) => count + 1)
    setOn(!on)
  }

  return (
    <Widget>
      <MiniWindow title="Share this portfolio" mat="ink">
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="share-demo-label" className="text-sm font-medium text-black dark:text-zinc-50">
                Read-only link
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {on ? 'Anyone with the link can look.' : 'Nobody can open it.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="share-demo-label"
              onClick={toggle}
              className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                on ? 'justify-end bg-mint-600' : 'justify-start bg-black/20 dark:bg-white/20'
              }`}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                className="h-6 w-6 rounded-full bg-white shadow"
              />
            </button>
          </div>

          <p
            className={`mt-4 truncate rounded-xl border px-3.5 py-2.5 font-mono text-xs transition-colors ${
              on
                ? 'border-mint-500/50 bg-mint-50 text-mint-900 dark:bg-mint-900/30 dark:text-mint-200'
                : 'border-black/[.08] text-zinc-400 line-through dark:border-white/[.1] dark:text-zinc-500'
            }`}
          >
            {link}
          </p>

          <div aria-live="polite" className="mt-4 min-h-[10.5rem]">
            <AnimatePresence mode="wait" initial={false}>
              {on ? (
                <motion.div
                  key={`on-${issued}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-2xl border border-black/[.07] p-4 dark:border-white/[.1]"
                >
                  <p className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      What they see
                    </span>
                    <span className="rounded-full border border-black/[.1] px-2 py-0.5 dark:border-white/[.15]">
                      Read-only view
                    </span>
                  </p>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {sampleHoldings.map((h) => (
                      <li key={h.id} className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-black dark:text-zinc-50">{h.ticker}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {h.thesis ? `Thesis v${h.thesis.version}` : 'No thesis'}
                        </span>
                        <span className="ml-auto text-zinc-700 tabular-nums dark:text-zinc-300">
                          {formatPercent(h.weight)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {issued > 0 && (
                    <p className="mt-3 text-xs text-mint-700 dark:text-mint-300">
                      This is a new link. The old one stays dead.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="off"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-2xl border border-dashed border-black/[.15] p-4 dark:border-white/[.2]"
                >
                  <p className="text-lg leading-7 text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">
                    That page isn&apos;t here
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Everyone who had the link sees this now. Switch sharing back on and a
                    different link is issued.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MiniWindow>
    </Widget>
  )
}
