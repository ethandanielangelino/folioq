'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { ChevronDown, ChevronsUpDown, Globe, LogOut, Settings } from 'lucide-react'
import { signOut } from '@/app/actions/auth'

const item =
  'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-800 outline-none select-none data-[highlighted]:bg-black/[.05] dark:text-zinc-200 dark:data-[highlighted]:bg-white/[.08]'

/** The avatar in the app bar: who is signed in, account settings, and sign out. */
export default function AccountMenu({
  email,
  name,
  variant = 'chip',
}: {
  email: string
  name: string | null
  /** "chip" is the small avatar button; "row" is the full-width one at the foot of the sidebar. */
  variant?: 'chip' | 'row'
}) {
  const [leaving, startTransition] = useTransition()
  const initial = (name || email || '?').trim().charAt(0).toUpperCase()

  return (
    <Menu.Root>
      {variant === 'row' ? (
        <Menu.Trigger
          aria-label="Account menu"
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/[.05] data-[popup-open]:bg-black/[.05] dark:hover:bg-white/[.07] dark:data-[popup-open]:bg-white/[.07]"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint-600/[.14] text-sm font-medium text-mint-800 dark:bg-mint-400/[.16] dark:text-mint-200"
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-black dark:text-zinc-50">
              {name ?? email}
            </span>
            {name && (
              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{email}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        </Menu.Trigger>
      ) : (
        <Menu.Trigger
          aria-label="Account menu"
          className="flex items-center gap-1.5 rounded-full border border-black/[.08] bg-white py-1 pr-2.5 pl-1 text-zinc-600 transition-colors hover:border-black/20 data-[popup-open]:border-black/20 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white/30"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white dark:bg-mint-300 dark:text-black"
          >
            {initial}
          </span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Menu.Trigger>
      )}
      <Menu.Portal>
        <Menu.Positioner
          side={variant === 'row' ? 'top' : 'bottom'}
          align={variant === 'row' ? 'start' : 'end'}
          sideOffset={10}
          className="z-[60]"
        >
          <Menu.Popup className="animate-menu-in w-64 origin-top-right rounded-2xl border border-black/[.08] bg-white p-1.5 shadow-xl shadow-black/[.12] outline-none dark:border-white/[.1] dark:bg-zinc-900 dark:shadow-black/50">
            <div className="px-3 pt-2.5 pb-3">
              {name && (
                <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{name}</p>
              )}
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            </div>
            <Menu.Separator className="mx-1.5 mb-1.5 h-px bg-black/[.07] dark:bg-white/[.1]" />
            <Menu.Item className={item} render={<Link href="/account" />}>
              <Settings className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Account settings
            </Menu.Item>
            <Menu.Item className={item} render={<Link href="/" />}>
              <Globe className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              FolioQ home page
            </Menu.Item>
            <Menu.Separator className="m-1.5 h-px bg-black/[.07] dark:bg-white/[.1]" />
            <Menu.Item
              className={item}
              disabled={leaving}
              closeOnClick={false}
              onClick={() => startTransition(() => signOut())}
            >
              <LogOut className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              {leaving ? 'Signing out…' : 'Sign out'}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
