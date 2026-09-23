'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-auto w-full rounded-2xl border-black/[.08] bg-white px-5 py-3.5 pr-12 text-sm text-black placeholder:text-zinc-400 focus-visible:border-black/[.2] focus-visible:ring-0 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:border-white/[.3]"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-2 my-auto h-8 w-8 rounded-full text-zinc-400 hover:bg-transparent hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </Button>
    </div>
  )
}
