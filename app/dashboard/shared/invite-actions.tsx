'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { BinFace, binButton } from '@/app/components/bin-button'
import { leavePortfolio, respondToInvite } from '@/app/dashboard/actions'
import {
  dangerButton,
  dialogPanel,
  errorText,
  outlineButton,
  primaryButton,
} from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** Accept or decline one invitation. */
export function InviteButtons({
  memberId,
  portfolioId,
  portfolioName,
}: {
  memberId: string
  portfolioId: string
  portfolioName: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function answer(accept: boolean) {
    setError('')
    startTransition(async () => {
      const result = await respondToInvite(memberId, accept)
      if (!result.ok) {
        setError(result.error)
        router.refresh()
        return
      }
      if (result.outcome === 'accepted') {
        toast(`${portfolioName} added to your shared portfolios`)
        router.push(`/dashboard/${portfolioId}`)
      } else {
        toast('Invite declined')
        router.refresh()
      }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => answer(true)} disabled={pending} className={primaryButton}>
          {pending ? 'Working…' : 'Accept'}
        </button>
        <button type="button" onClick={() => answer(false)} disabled={pending} className={outlineButton}>
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className={`mt-3 ${errorText}`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Take a shared portfolio off your own list, after confirming. */
export function LeaveButton({
  memberId,
  portfolioName,
  ownerName,
  className = binButton,
  label = 'Remove from my list',
}: {
  memberId: string
  portfolioName: string
  ownerName: string
  className?: string
  label?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function leave() {
    setError('')
    startTransition(async () => {
      const result = await leavePortfolio(memberId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast(`${portfolioName} removed from your list`)
      router.push('/dashboard/shared')
      router.refresh()
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
      <DialogTrigger className={className} aria-label={label} title={label}>
        <BinFace label={label} />
      </DialogTrigger>
      <DialogContent className={dialogPanel}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">
          Remove {portfolioName} from your list?
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          You will no longer be able to open it. Nothing in the portfolio changes, and {ownerName}{' '}
          can invite you again later.
        </DialogDescription>
        {error && (
          <p role="alert" className={`mt-4 ${errorText}`}>
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <DialogClose className={outlineButton}>Keep it</DialogClose>
          <button type="button" onClick={leave} disabled={pending} className={dangerButton}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pending ? 'Removing…' : 'Remove from my list'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
