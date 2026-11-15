'use client'

import { useId, useState, useTransition } from 'react'
import { draftThesisForHolding, saveThesis } from '@/app/dashboard/actions'
import {
  dialogPanel,
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
} from '@/app/components/styles'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/app/components/toast'

interface Fields {
  claim: string
  assumptions: string
  risks: string
}

const toLines = (items: string[]) => items.join('\n')
const fromLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)

/** Same wording, ignoring whitespace and list formatting. */
function sameText(a: Fields, b: Fields): boolean {
  const norm = (f: Fields) =>
    JSON.stringify([f.claim.trim(), fromLines(f.assumptions), fromLines(f.risks)])
  return norm(a) === norm(b)
}

export default function ThesisDialog({
  portfolioId,
  holdingId,
  ticker,
  current,
  triggerClassName = outlineButton,
}: {
  portfolioId: string
  holdingId: string
  ticker: string
  /** The latest saved thesis, if there is one. */
  current: { claim: string; assumptions: string[]; risks: string[] } | null
  triggerClassName?: string
}) {
  const initial: Fields = {
    claim: current?.claim ?? '',
    assumptions: toLines(current?.assumptions ?? []),
    risks: toLines(current?.risks ?? []),
  }

  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<Fields>(initial)
  // The AI draft as it arrived, to tell whether the owner changed it before saving.
  const [aiDraft, setAiDraft] = useState<Fields | null>(null)
  const [error, setError] = useState('')
  const [saving, startSave] = useTransition()
  const [drafting, startDraft] = useTransition()
  const uid = useId()
  const toast = useToast()

  const unchangedDraft = aiDraft !== null && sameText(fields, aiDraft)

  function set(name: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [name]: value }))
  }

  function draft() {
    setError('')
    startDraft(async () => {
      const result = await draftThesisForHolding(portfolioId, holdingId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const next: Fields = {
        claim: result.draft.claim,
        assumptions: toLines(result.draft.assumptions),
        risks: toLines(result.draft.risks),
      }
      setFields(next)
      setAiDraft(next)
    })
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    startSave(async () => {
      const result = await saveThesis(portfolioId, holdingId, {
        claim: fields.claim,
        assumptions: fromLines(fields.assumptions),
        risks: fromLines(fields.risks),
        authorEdited: !unchangedDraft,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Close (and confirm) in the same transition as the refreshed page, so the
      // dialog stays on its saving state until the new numbers are showing.
      startSave(() => {
        setOpen(false)
        toast(`Thesis for ${ticker} saved`)
      })
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setFields(initial)
        setAiDraft(null)
        setError('')
      }}
    >
      <DialogTrigger
        className={triggerClassName}
        aria-label={`${current ? 'Edit' : 'Write'} thesis for ${ticker}`}
      >
        {current ? 'Edit thesis' : 'Write thesis'}
      </DialogTrigger>
      <DialogContent
        className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl`}
      >
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          Thesis for {ticker}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {current
            ? 'Saving creates a new version. Earlier versions stay on record.'
            : 'Say why this position is held, in words you would stand behind if asked.'}
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
            <p className="max-w-[18rem] text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              Stuck? Get a first draft from AI, then rewrite it until it is your reasoning.
              {aiDraft && (
                <span className="mt-1 block">
                  Drafted by Google&apos;s Gemini from this holding&apos;s figures and, for a listed company,{' '}
                  <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    Finnhub
                  </a>
                  &apos;s company profile and recent headlines. It can be wrong; check it.
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={draft}
              disabled={drafting || saving}
              className={`${outlineButton} bg-white px-4 py-2 dark:bg-zinc-900`}
            >
              {drafting ? 'Drafting…' : aiDraft ? 'Draft again' : 'Draft with AI'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-claim`} className={fieldLabel}>
              Claim
            </label>
            <textarea
              id={`${uid}-claim`}
              required
              maxLength={1000}
              rows={3}
              value={fields.claim}
              onChange={(e) => set('claim', e.target.value)}
              placeholder="Why does this position belong in the portfolio?"
              className={`${field} resize-y`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-assumptions`} className={fieldLabel}>
              Assumptions{' '}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">One per line</span>
            </label>
            <textarea
              id={`${uid}-assumptions`}
              rows={4}
              value={fields.assumptions}
              onChange={(e) => set('assumptions', e.target.value)}
              placeholder="What has to stay true for the claim to hold?"
              className={`${field} resize-y`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-risks`} className={fieldLabel}>
              Risks{' '}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">One per line</span>
            </label>
            <textarea
              id={`${uid}-risks`}
              rows={4}
              value={fields.risks}
              onChange={(e) => set('risks', e.target.value)}
              placeholder="What could go wrong?"
              className={`${field} resize-y`}
            />
          </div>

          {unchangedDraft && (
            <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              This is the AI draft as written. If you save it unchanged, it will be marked
              &ldquo;AI draft&rdquo; wherever the thesis is shown, including shared links.
            </p>
          )}

          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}

          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose className={outlineButton}>Cancel</DialogClose>
            <button type="submit" disabled={saving || drafting} className={primaryButton}>
              {saving ? 'Saving…' : 'Save thesis'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
