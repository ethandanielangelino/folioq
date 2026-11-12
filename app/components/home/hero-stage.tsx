'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, Flag, Link2 } from 'lucide-react'
import AnimatedNumber from '@/app/components/motion/animated-number'
import Wiggle from '@/app/components/motion/wiggle'
import Delta from '@/app/components/portfolio/delta'
import type { Holding } from '@/lib/data'
import { formatDate, formatMoney, formatPercent, marketDate } from '@/lib/format'
import { sampleHoldings, sampleTotals } from '@/lib/sample'

const deck = sampleHoldings
const flagged = deck.find((h) => !h.thesis)
const versioned = deck.find((h) => h.thesis && h.thesisHistory.length > 0)

// Where a card sits depending on how far it is from the front of the stack.
const seats = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
  { x: 34, y: 14, rotate: 5, scale: 0.95, opacity: 1 },
  { x: -34, y: 14, rotate: -5, scale: 0.95, opacity: 1 },
]

const chip =
  'rounded-2xl border border-black/[.06] bg-white/95 px-4 py-3 text-left shadow-lg shadow-black/[.08] backdrop-blur dark:border-white/[.1] dark:bg-zinc-900/95 dark:shadow-black/40'

function HoldingCard({ holding }: { holding: Holding }) {
  const thesis = holding.thesis
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/[.06] bg-white shadow-2xl shadow-black/20 select-none dark:border-white/[.1] dark:bg-zinc-900">
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              {holding.ticker}
            </p>
            <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
              {holding.name}
            </p>
          </div>
          <p className="shrink-0 rounded-full bg-mint-100 px-3 py-1 text-sm font-medium text-mint-800 tabular-nums dark:bg-mint-900/60 dark:text-mint-200">
            {formatPercent(holding.weight)}
          </p>
        </div>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
          <span className="text-lg font-semibold text-black dark:text-zinc-50">
            {formatMoney(holding.marketValue)}
          </span>
          <Delta amount={holding.gain} ratio={holding.gainPct} />
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-between bg-black px-6 py-5 text-zinc-100 dark:bg-zinc-950">
        {thesis ? (
          <>
            <div>
              <p className="text-xs text-mint-300">Why the fund holds it</p>
              <p className="mt-2 line-clamp-5 text-[1.05rem] leading-7 [font-family:var(--font-serif),serif]">
                {thesis.claim}
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-mint-400" />
              Version {thesis.version}, saved {formatDate(marketDate(new Date(thesis.createdAt)))}
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-amber-tint">No thesis on record</p>
              <p className="mt-2 text-[1.05rem] leading-7 [font-family:var(--font-serif),serif]">
                Nothing says why this is held.
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                FolioQ doesn&apos;t hide the gap. It stays flagged for the owner and on every
                shared link until someone writes the reason down.
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-deep" />
              Flagged since {formatDate(holding.openedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The home page's opening scene: a stack of sample holdings to flick through,
 * with small status cards around it. Everything can be picked up and dropped.
 */
export default function HeroStage() {
  const [index, setIndex] = useState(0)
  const count = deck.length

  const go = (step: number) => setIndex((current) => (current + step + count) % count)
  const show = (id: string | undefined) => {
    const target = deck.findIndex((h) => h.id === id)
    if (target >= 0) setIndex(target)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') go(1)
    else if (event.key === 'ArrowLeft') go(-1)
    else return
    event.preventDefault()
  }

  return (
    <figure className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="stage relative overflow-hidden rounded-[2.5rem] px-5 text-left pt-10 pb-8 sm:px-10 sm:pt-14 sm:pb-10"
      >
        <div aria-hidden="true" className="rings pointer-events-none absolute inset-0" />

        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Holdings in the sample fund"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative mx-auto h-[25.5rem] w-full max-w-[21.5rem] rounded-[1.75rem] outline-offset-8"
        >
          {deck.map((holding, i) => {
            const offset = (i - index + count) % count
            const front = offset === 0
            return (
              <motion.div
                key={holding.id}
                aria-hidden={!front}
                initial={false}
                animate={seats[Math.min(offset, seats.length - 1)]}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                style={{ zIndex: count - offset }}
                className="absolute inset-0"
              >
                <motion.div
                  drag={front ? 'x' : false}
                  dragSnapToOrigin
                  dragElastic={0.5}
                  whileDrag={{ rotate: 3, cursor: 'grabbing' }}
                  onDragEnd={(_, info) => {
                    if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 600) {
                      go(info.offset.x < 0 ? 1 : -1)
                    }
                  }}
                  onClick={front ? undefined : () => setIndex(i)}
                  className={`h-full ${front ? 'cursor-grab' : 'cursor-pointer'}`}
                >
                  <HoldingCard holding={holding} />
                </motion.div>
              </motion.div>
            )
          })}
        </div>

        <div className="relative mt-7 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous holding"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-zinc-700 transition-colors hover:bg-white dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            {deck.map((holding, i) => (
              <button
                key={holding.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${holding.ticker}`}
                aria-current={i === index}
                className="group flex h-6 items-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    i === index
                      ? 'w-6 bg-black dark:bg-zinc-50'
                      : 'w-1.5 bg-black/25 group-hover:bg-black/50 dark:bg-white/30 dark:group-hover:bg-white/60'
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next holding"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-zinc-700 transition-colors hover:bg-white dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Status cards: a tidy grid on small screens, scattered around the stack on large ones. */}
        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:static lg:mt-0 lg:block">
          <Satellite className="lg:absolute lg:top-16 lg:left-[5%] xl:left-[8%]" delay={0.45}>
            <div className={`${chip} lg:w-60`}>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Campus Value Fund</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-black tabular-nums dark:text-zinc-50">
                <AnimatedNumber
                  value={sampleTotals.marketValue}
                  from={sampleTotals.costBasis}
                  format={formatMoney}
                />
              </p>
              <p className="mt-1 text-xs tabular-nums">
                <Delta amount={sampleTotals.gain} ratio={sampleTotals.gainPct} />
              </p>
            </div>
          </Satellite>

          <Satellite
            className="lg:absolute lg:top-24 lg:right-[5%] xl:right-[8%]"
            delay={0.57}
            floatDelay={1.2}
          >
            <div className={`${chip} flex items-center gap-3 lg:w-64`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-tint text-black">
                <Link2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium text-black dark:text-zinc-50">
                  Read-only link is on
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  Anyone with it can look. Nobody can edit.
                </span>
              </span>
            </div>
          </Satellite>

          {versioned?.thesis && (
            <Satellite
              className="lg:absolute lg:bottom-28 lg:left-[7%] xl:left-[11%]"
              delay={0.69}
              floatDelay={2.1}
            >
              <button
                type="button"
                onClick={() => show(versioned.id)}
                className={`${chip} flex w-full items-center gap-3 lg:w-60`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-200 text-mint-900">
                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-black dark:text-zinc-50">
                    {versioned.ticker} thesis, version {versioned.thesis.version}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    The earlier version is kept
                  </span>
                </span>
              </button>
            </Satellite>
          )}

          {flagged && (
            <Satellite
              className="lg:absolute lg:right-[7%] lg:bottom-32 xl:right-[11%]"
              delay={0.81}
              floatDelay={0.6}
            >
              <button
                type="button"
                onClick={() => show(flagged.id)}
                className={`${chip} flex w-full items-center gap-3 lg:w-56`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-tint text-black">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-black dark:text-zinc-50">
                    {flagged.ticker} has no thesis
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    Flagged until one is written
                  </span>
                </span>
              </button>
            </Satellite>
          )}
        </div>
      </motion.div>

      <figcaption className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Swipe the cards, or pick up anything on the panel. Sample data: the fund and its prices
        are invented.
      </figcaption>
    </figure>
  )
}

/** A status card that pops in after the stage, then floats and can be dragged. */
function Satellite({
  children,
  className,
  delay,
  floatDelay = 0,
}: {
  children: React.ReactNode
  className: string
  delay: number
  floatDelay?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}
    >
      <Wiggle draggable float={5} floatDelay={floatDelay} tilt={7}>
        {children}
      </Wiggle>
    </motion.div>
  )
}
