'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import { changePassword } from '@/app/account/actions'
import { signOut } from '@/app/actions/auth'
import PasswordChecklist from '@/app/components/password-checklist'
import PasswordInput from '@/app/components/password-input'
import {
  errorText,
  field,
  fieldLabel,
  outlineButton,
  primaryButton,
  textLink,
} from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import { passwordProblems } from '@/lib/credentials'
import { callbackUrl } from '@/lib/routes'
import { createClient } from '@/lib/supabase/client'

export function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    // Keep the name other people see when sharing in step. If sharing isn't
    // set up yet this simply does nothing.
    if (!error) await supabase.rpc('ensure_profile', { p_name: trimmed })
    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }
    toast('Name saved')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={fieldLabel}>Full name</span>
        <input
          name="name"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || name.trim() === initialName}
        className={`${primaryButton} self-start`}
      >
        {saving ? 'Saving…' : 'Save name'}
      </button>
    </form>
  )
}

/**
 * - "set": the account has never had a password (it signed up with Google)
 * - "change": it has one, so the current password is asked for first
 * - "reset": the person just came in through a reset email, so it isn't
 */
export type PasswordMode = 'set' | 'change' | 'reset'

export function PasswordForm({ mode, email }: { mode: PasswordMode; email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, startSaving] = useTransition()
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const ready =
    passwordProblems(next).length === 0 && confirm.length > 0 && (mode !== 'change' || current.length > 0)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (next !== confirm) {
      setError('The two new passwords don’t match.')
      return
    }
    const formData = new FormData(event.currentTarget)
    startSaving(async () => {
      // On success this signs out everywhere and moves to the log-in page.
      const result = await changePassword(formData)
      if (result?.ok === false) setError(result.error)
    })
  }

  async function sendReset() {
    setError('')
    setResetState('sending')
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl('/account?reset=1'),
    })
    if (error) {
      setResetState('idle')
      setError(error.message)
      return
    }
    setResetState('sent')
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
      {mode === 'change' && (
        <div className="flex flex-col gap-2">
          <label htmlFor="current-password" className={fieldLabel}>
            Current password
          </label>
          <PasswordInput
            id="current-password"
            name="current"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          {resetState === 'sent' ? (
            <p role="status" className="text-xs leading-5 text-mint-800 dark:text-mint-200">
              A reset link is on its way to {email}. Open it on this device and you can choose a
              new password without the current one.
            </p>
          ) : (
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Forgotten it?{' '}
              <button
                type="button"
                onClick={sendReset}
                disabled={resetState === 'sending'}
                className={textLink}
              >
                {resetState === 'sending' ? 'Sending…' : 'Email me a reset link'}
              </button>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className={fieldLabel}>
          New password
        </label>
        <PasswordInput
          id="new-password"
          name="next"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          autoFocus={mode === 'reset'}
        />
        <PasswordChecklist password={next} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="confirm-password" className={fieldLabel}>
          Confirm new password
        </label>
        <PasswordInput
          id="confirm-password"
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {confirm.length > 0 && confirm !== next && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Doesn’t match yet.</p>
        )}
      </div>

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}

      <button type="submit" disabled={saving || !ready} className={`${primaryButton} self-start`}>
        {saving ? 'Saving and signing out…' : mode === 'set' ? 'Set password' : 'Save new password'}
      </button>
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Saving signs this account out on every device, including this one. You then log in again
        with the new password.
      </p>
    </form>
  )
}

/** The account's share ID, with a button to copy it. */
export function ShareIdCard({ code }: { code: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast('Share ID copied')
    } catch {
      // Clipboard blocked: the ID is on screen to copy by hand.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="rounded-2xl border border-mint-600/30 bg-mint-600/[.08] px-5 py-3 font-mono text-xl font-semibold tracking-wider text-black select-all dark:border-mint-400/30 dark:bg-mint-400/[.1] dark:text-zinc-50">
        {code}
      </p>
      <button type="button" onClick={copy} className={`${outlineButton} gap-2`}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export function SignOutButton() {
  const [leaving, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={leaving}
      onClick={() => startTransition(() => signOut())}
      className={outlineButton}
    >
      {leaving ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
