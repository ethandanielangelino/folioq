'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createPortfolio, updatePortfolio } from '@/app/dashboard/actions'
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

/**
 * Creates a portfolio, or edits one when `portfolio` is given.
 */
export default function PortfolioFormDialog({
  portfolio,
  triggerLabel,
  triggerClassName = primaryButton,
  defaultOpen = false,
}: {
  portfolio?: { id: string; name: string; mandate: string | null }
  triggerLabel: string
  triggerClassName?: string
  /** Start open, for links that lead straight to "say what this is for". */
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(defaultOpen)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const editing = Boolean(portfolio)
  const toast = useToast()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError('')

    startTransition(async () => {
      // createPortfolio redirects to the new portfolio on success.
      const result = portfolio
        ? await updatePortfolio(portfolio.id, formData)
        : await createPortfolio(formData)

      // A redirecting action may never hand back a result, hence the guards.
      if (result?.ok === false) setError(result.error)
      else if (result?.ok) {
        setOpen(false)
        toast('Portfolio updated')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setError('')
          // Drop the "?edit=" that opened it, so a reload doesn't open it again.
          if (defaultOpen) router.replace(pathname, { scroll: false })
        }
      }}
    >
      <DialogTrigger className={triggerClassName}>{triggerLabel}</DialogTrigger>
      <DialogContent className={dialogPanel}>
        <DialogTitle className="text-2xl text-black [font-family:var(--font-serif),serif] dark:text-zinc-50">
          {editing ? 'Edit portfolio' : 'New portfolio'}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {editing
            ? 'Change the name or what this portfolio is for.'
            : 'Name it after the money it tracks. You can add holdings right after.'}
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className={fieldLabel}>Name</span>
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={portfolio?.name ?? ''}
              placeholder="Student Investment Fund"
              className={field}
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={fieldLabel}>
              What is it for?{' '}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">Optional</span>
            </span>
            <textarea
              name="mandate"
              maxLength={500}
              rows={3}
              defaultValue={portfolio?.mandate ?? ''}
              placeholder="Long-only US equities run by the club's analysts for its 40 members. No position above 25%."
              className={`${field} resize-none`}
              autoFocus={defaultOpen}
            />
            <span className="text-xs leading-5 font-normal text-zinc-500 dark:text-zinc-400">
              Worth filling in. The assistant reads every question through this: whose money it
              is, what it is meant to do, and any limits you work within. People with the share
              link see it too.
            </span>
          </label>

          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}

          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose className={outlineButton}>Cancel</DialogClose>
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Create portfolio'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
