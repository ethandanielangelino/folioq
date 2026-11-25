'use client'

// Adds or changes the note on cash moved in or out, after it was recorded:
// where money added came from, or what money taken out was for. Only the note
// changes; the amount and date stay. The database keeps the earlier wording.

import { useId, useState, useTransition } from 'react'
import { MessageSquareText, Pencil } from 'lucide-react'
import { dialogPanel, errorText, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { setEntryPurpose } from '@/app/dashboard/actions'
import { PurposeField } from '@/app/dashboard/[id]/cash-dialog'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cleanPurpose, type HistoryEntry } from '@/lib/history'

export default function PurposeDialog({ portfolioId, entry }: { portfolioId: string; entry: HistoryEntry }) {
  const [open, setOpen] = useState(false)
  const has = entry.purpose !== null
  const out = entry.kind === 'withdrawn'
  const what = out ? 'purpose' : 'source'
  const Icon = has ? Pencil : MessageSquareText
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={`${has ? 'Edit' : 'Add'} ${out ? 'what this money was for' : 'where this money came from'}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-black/[.05] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {has ? `Edit ${what}` : `Add ${what}`}
      </DialogTrigger>
      <DialogContent className={dialogPanel}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">{out ? 'What was it for?' : 'Where did it come from?'}</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          A note on {out ? 'why this money was taken out' : 'where this money came from'}, so it&apos;s clear when you look back. The amount
          and date stay as they are.
        </DialogDescription>
        {open && <PurposeForm portfolioId={portfolioId} entry={entry} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PurposeForm({ portfolioId, entry, onDone }: { portfolioId: string; entry: HistoryEntry; onDone: () => void }) {
  const uid = useId()
  const toast = useToast()
  const [purpose, setPurpose] = useState(entry.purpose ?? '')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const unchanged = cleanPurpose(purpose) === (entry.purpose ?? '')

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await setEntryPurpose(portfolioId, entry.id, purpose)
      if (!result.ok) return setError(result.error)
      startTransition(() => {
        onDone()
        toast(cleanPurpose(purpose) ? 'Note saved' : 'Note removed')
      })
    })
  }

  return (
    <form onSubmit={onSubmit} className="rise-in mt-6 flex flex-col gap-5">
      <PurposeField id={`${uid}-purpose`} direction={entry.kind === 'withdrawn' ? 'out' : 'in'} value={purpose} onChange={setPurpose} />
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <DialogClose className={outlineButton}>Cancel</DialogClose>
        <button type="submit" disabled={pending || unchanged} className={primaryButton}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
