'use client'

import { useState, useTransition } from 'react'
import { deletePortfolio } from '@/app/dashboard/actions'
import { dangerButton, dialogPanel, errorText, outlineButton } from '@/app/components/styles'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default function DeletePortfolioButton({
  portfolioId,
  name,
  holdingCount,
}: {
  portfolioId: string
  name: string
  holdingCount: number
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError('')
    startTransition(async () => {
      // On success the action redirects back to the portfolio list.
      const result = await deletePortfolio(portfolioId)
      if (result?.ok === false) setError(result.error)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError('')
      }}
    >
      <DialogTrigger className="text-sm font-medium text-zinc-500 underline-offset-4 hover:text-red-700 hover:underline dark:text-zinc-400 dark:hover:text-red-400">
        Delete portfolio
      </DialogTrigger>
      <DialogContent className={dialogPanel}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          Delete “{name}”?
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          This removes the portfolio, its{' '}
          {holdingCount === 1 ? 'one holding' : `${holdingCount} holdings`} and their theses, the
          assistant conversation, and any share link. It can&apos;t be undone.
        </DialogDescription>

        {error && (
          <p role="alert" className={`mt-4 ${errorText}`}>
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <DialogClose className={outlineButton}>Keep portfolio</DialogClose>
          <button type="button" onClick={confirm} disabled={pending} className={dangerButton}>
            {pending ? 'Deleting…' : 'Delete portfolio'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
