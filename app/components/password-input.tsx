'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { field } from '@/app/components/styles'

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  autoFocus = false,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** "current-password" when logging in, "new-password" when choosing one. */
  autoComplete?: 'current-password' | 'new-password'
  autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={`${field} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}
