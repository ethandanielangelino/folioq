'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Eye, Globe, Lock, Pencil, UserRoundPlus, X } from 'lucide-react'
import {
  inviteMember,
  lookupShareCode,
  removeMember,
  setMemberRole,
  setSharing,
} from '@/app/dashboard/actions'
import { errorText, field, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { MemberRole, Person } from '@/lib/sharing'

// The site's own address, read in the browser so links work on any domain.
const subscribe = () => () => {}
function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => ''
  )
}

const roles: { value: MemberRole; label: string; detail: string; Icon: typeof Eye }[] = [
  {
    value: 'viewer',
    label: 'View only',
    detail: 'Sees holdings, values, and every thesis. Can’t change anything.',
    Icon: Eye,
  },
  {
    value: 'editor',
    label: 'Editor',
    detail: 'Can also add, change, and remove holdings and theses. You see their changes as they make them.',
    Icon: Pencil,
  },
]

const choice = (active: boolean) =>
  `flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
    active
      ? 'border-mint-600 bg-mint-600/[.08] dark:border-mint-400 dark:bg-mint-400/[.1]'
      : 'border-black/[.1] hover:border-black/25 dark:border-white/[.15] dark:hover:border-white/30'
  }`

/** What the days-left wording should be, worked out on the server so it can't mismatch. */
export interface PersonRow extends Person {
  /** e.g. "6 days". Empty once accepted. */
  left: string
}

export default function ShareDialog({
  portfolioId,
  portfolioName,
  shareToken,
  linkAvailable,
  people,
}: {
  portfolioId: string
  portfolioName: string
  shareToken: string | null
  /** False until the share_token column exists in the database. */
  linkAvailable: boolean
  /** Null until supabase/sharing.sql has been run. */
  people: PersonRow[] | null
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const origin = useOrigin()
  const toast = useToast()

  // Sharing with a person happens in two steps: find them, then confirm.
  const [code, setCode] = useState('')
  const [found, setFound] = useState<{ code: string; name: string } | null>(null)
  const [role, setRole] = useState<MemberRole>('viewer')

  const link = shareToken ? `${origin}/share/${shareToken}` : ''
  const count = people?.length ?? 0

  function reset() {
    setError('')
    setCopied(false)
    setCode('')
    setFound(null)
    setRole('viewer')
  }

  function setLink(makePublic: boolean) {
    if (makePublic === Boolean(shareToken)) return
    setError('')
    setCopied(false)
    startTransition(async () => {
      const result = await setSharing(portfolioId, makePublic)
      if (!result.ok) setError(result.error)
      else toast(makePublic ? 'Link is public' : 'Link is private')
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast('Link copied')
    } catch {
      setError('Could not copy automatically. Select the link and copy it.')
    }
  }

  function find(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await lookupShareCode(code)
      if (!result.ok) setError(result.error)
      else setFound({ code: result.code, name: result.name })
    })
  }

  function confirmShare() {
    if (!found) return
    setError('')
    startTransition(async () => {
      const result = await inviteMember(portfolioId, found.code, role)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(`Invite sent to ${found.name}`)
      setCode('')
      setFound(null)
      setRole('viewer')
    })
  }

  function changeRole(person: PersonRow, next: MemberRole) {
    if (next === person.role) return
    setError('')
    startTransition(async () => {
      const result = await setMemberRole(portfolioId, person.memberId, next)
      if (!result.ok) setError(result.error)
      else toast(`${person.name} is now ${next === 'editor' ? 'an editor' : 'view-only'}`)
    })
  }

  function remove(person: PersonRow) {
    setError('')
    startTransition(async () => {
      const result = await removeMember(portfolioId, person.memberId)
      if (!result.ok) setError(result.error)
      else toast(person.status === 'pending' ? 'Invite withdrawn' : `${person.name} no longer has access`)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger className={outlineButton}>
        {shareToken || count > 0 ? 'Shared' : 'Share'}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto rounded-3xl border border-black/[.08] bg-white p-7 ring-0 sm:max-w-lg dark:border-white/[.08] dark:bg-zinc-900">
        {found ? (
          /* ------------------------------------------------ confirm step */
          <>
            <DialogTitle className="text-2xl text-black dark:text-zinc-50">
              Share with {found.name}?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              You are about to share{' '}
              <span className="font-medium text-black dark:text-zinc-50">{portfolioName}</span> with{' '}
              <span className="font-medium text-black dark:text-zinc-50">{found.name}</span> (
              <span className="font-mono text-xs">{found.code}</span>). They get an invite they can
              accept or decline, and it lapses after 7 days.
            </DialogDescription>

            <fieldset className="mt-6">
              <legend className="text-sm font-medium text-black dark:text-zinc-50">
                What can {found.name} do?
              </legend>
              <div role="radiogroup" aria-label="Access level" className="mt-3 flex flex-col gap-2.5">
                {roles.map(({ value, label, detail, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={choice(role === value)}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-medium text-black dark:text-zinc-50">{label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                        {detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <p role="alert" className={`mt-4 ${errorText}`}>
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setFound(null)
                  setError('')
                }}
                disabled={pending}
                className={outlineButton}
              >
                Back
              </button>
              <button type="button" onClick={confirmShare} disabled={pending} className={primaryButton}>
                {pending ? 'Sending…' : `Share with ${found.name}`}
              </button>
            </div>
          </>
        ) : (
          /* ---------------------------------------------------- main view */
          <>
            <DialogTitle className="text-2xl text-black dark:text-zinc-50">
              Share {portfolioName}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Invite specific people by their share ID, or make a link anyone can open.
            </DialogDescription>

            {/* People */}
            <section className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-medium text-black dark:text-zinc-50">
                <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
                Share with a person
              </h3>

              {people === null ? (
                <p className="mt-3 rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Sharing with people isn&apos;t set up yet. Run{' '}
                  <code className="font-mono text-xs">supabase/sharing.sql</code> in the Supabase
                  SQL editor, then reload this page.
                </p>
              ) : (
                <>
                  <form onSubmit={find} className="mt-3 flex gap-2">
                    <label htmlFor="share-code" className="sr-only">
                      Their share ID
                    </label>
                    <input
                      id="share-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Their share ID, e.g. FQ-7K3M-9X2P"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={20}
                      className={`${field} font-mono uppercase placeholder:font-sans placeholder:normal-case`}
                    />
                    <button
                      type="submit"
                      disabled={pending || !code.trim()}
                      className={`${primaryButton} shrink-0`}
                    >
                      {pending ? 'Looking…' : 'Find'}
                    </button>
                  </form>
                  <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    They&apos;ll find it under Account in their own FolioQ. You confirm who it is
                    before anything is shared.
                  </p>

                  {count > 0 && (
                    <ul className="mt-4 divide-y divide-black/[.06] rounded-2xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.1]">
                      {people.map((person) => (
                        <li key={person.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                          <span className="min-w-0 flex-1 basis-40">
                            <span className="block truncate text-sm font-medium text-black dark:text-zinc-50">
                              {person.name}
                            </span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                              {person.status === 'pending'
                                ? `Invited, ${person.left} left to accept`
                                : 'Has access'}
                            </span>
                          </span>
                          <label className="sr-only" htmlFor={`role-${person.memberId}`}>
                            What {person.name} can do
                          </label>
                          <select
                            id={`role-${person.memberId}`}
                            value={person.role}
                            disabled={pending}
                            onChange={(e) => changeRole(person, e.target.value as MemberRole)}
                            className="h-9 rounded-full border border-black/[.1] bg-white px-3 text-sm text-black dark:border-white/[.15] dark:bg-zinc-900 dark:text-zinc-50"
                          >
                            <option value="viewer">View only</option>
                            <option value="editor">Editor</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => remove(person)}
                            disabled={pending}
                            aria-label={
                              person.status === 'pending'
                                ? `Withdraw the invite to ${person.name}`
                                : `Remove ${person.name}’s access`
                            }
                            title={person.status === 'pending' ? 'Withdraw invite' : 'Remove access'}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-red-600/10 hover:text-red-700 dark:text-zinc-400 dark:hover:text-red-400"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {/* Link */}
            <section className="mt-7 border-t border-black/[.07] pt-6 dark:border-white/[.1]">
              <h3 className="text-sm font-medium text-black dark:text-zinc-50">Link access</h3>

              {!linkAvailable ? (
                <p className="mt-3 rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Links aren&apos;t set up yet. Run{' '}
                  <code className="font-mono text-xs">supabase/setup.sql</code> in the Supabase SQL
                  editor, then reload this page.
                </p>
              ) : (
                <>
                  <div role="radiogroup" aria-label="Link access" className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!shareToken}
                      disabled={pending}
                      onClick={() => setLink(false)}
                      className={choice(!shareToken)}
                    >
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-medium text-black dark:text-zinc-50">Private</span>
                        <span className="mt-0.5 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                          Only you and the people listed above.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={Boolean(shareToken)}
                      disabled={pending}
                      onClick={() => setLink(true)}
                      className={choice(Boolean(shareToken))}
                    >
                      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-medium text-black dark:text-zinc-50">Public</span>
                        <span className="mt-0.5 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                          Anyone with the link can view. No account needed.
                        </span>
                      </span>
                    </button>
                  </div>

                  {shareToken && (
                    <div className="mt-3 flex gap-2">
                      <label htmlFor="share-link" className="sr-only">
                        Public link
                      </label>
                      <input
                        id="share-link"
                        readOnly
                        value={link}
                        onFocus={(e) => e.currentTarget.select()}
                        className={`${field} font-mono text-xs`}
                      />
                      <button type="button" onClick={copy} className={`${outlineButton} shrink-0`}>
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {shareToken
                      ? 'Viewers can’t change anything. Switching to private breaks this link for everyone; going public again creates a new one.'
                      : 'No link works right now.'}
                  </p>
                </>
              )}
            </section>

            {error && (
              <p role="alert" className={`mt-4 ${errorText}`}>
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
