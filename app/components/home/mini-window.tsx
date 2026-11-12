const mats = {
  mint: 'mat-mint shadow-[0_40px_70px_-40px_#136b59]',
  sky: 'mat-sky shadow-[0_40px_70px_-40px_#1c5f86]',
  amber: 'mat-amber shadow-[0_40px_70px_-40px_#b86a12]',
  ink: 'mat-ink shadow-[0_40px_70px_-40px_#0d1524]',
} as const

/**
 * A miniature app window on a coloured mat, used on public pages to show a
 * working piece of the product.
 */
export default function MiniWindow({
  title,
  mat,
  children,
}: {
  title: string
  mat: keyof typeof mats
  children: React.ReactNode
}) {
  return (
    <div className={`${mats[mat]} rounded-[2rem] p-3 sm:p-4 dark:shadow-none`}>
      <div className="overflow-hidden rounded-[1.35rem] bg-white shadow-xl shadow-black/15 dark:bg-zinc-900">
        <div className="flex items-center gap-3 border-b border-black/[.06] px-4 py-2.5 dark:border-white/[.08]">
          <span aria-hidden="true" className="flex w-10 gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-mint-400" />
          </span>
          <p className="flex-1 truncate text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {title}
          </p>
          <span aria-hidden="true" className="w-10" />
        </div>
        {children}
      </div>
    </div>
  )
}
