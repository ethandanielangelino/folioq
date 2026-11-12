// Shared class strings so buttons and fields look the same everywhere.

export const primaryButton =
  'inline-flex h-auto items-center justify-center gap-2 rounded-full bg-mint-700 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_-10px_var(--color-mint-700)] transition-[background-color,box-shadow,transform] hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:bg-mint-300 dark:text-black dark:shadow-none dark:hover:bg-mint-200'

export const outlineButton =
  'inline-flex h-auto items-center justify-center gap-2 rounded-full border border-black/[.12] bg-white/60 px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[.06] dark:hover:text-zinc-100'

export const dangerButton =
  'inline-flex h-auto items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'

export const field =
  'h-auto w-full rounded-2xl border border-black/[.1] bg-white px-4 py-3 text-sm text-black placeholder:text-zinc-400 outline-none transition-[border-color,box-shadow] focus-visible:border-mint-600 focus-visible:ring-4 focus-visible:ring-mint-500/15 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:border-mint-400'

export const fieldLabel = 'text-sm font-medium text-zinc-800 dark:text-zinc-200'

export const card =
  'rounded-3xl border border-black/[.07] bg-white shadow-[0_1px_0_rgb(13_21_36/0.02),0_12px_32px_-24px_rgb(13_21_36/0.25)] dark:border-white/[.08] dark:bg-zinc-900 dark:shadow-none'

export const dialogPanel =
  'gap-0 rounded-3xl border border-black/[.08] bg-white p-7 ring-0 sm:max-w-md dark:border-white/[.08] dark:bg-zinc-900'

export const errorText = 'text-sm text-red-700 dark:text-red-400'

export const textLink =
  'rounded font-medium text-mint-700 underline-offset-4 hover:underline dark:text-mint-300'
