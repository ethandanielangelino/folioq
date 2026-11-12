import Image from 'next/image'
import Link from 'next/link'
import AuthAside from '@/app/components/auth-aside'

/**
 * Frame for the signed-out account pages (log in, sign up, reset password):
 * the form on the left, a piece of the product on the right on wide screens.
 */
export default function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string
  lede: React.ReactNode
  children: React.ReactNode
  /** The "no account yet?" style line under the form. */
  footer?: React.ReactNode
}) {
  return (
    <div className="grid flex-1 bg-zinc-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] dark:bg-black">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 self-start rounded-full">
          <Image
            src="/FolioQ-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
            priority
          />
          <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            FolioQ
          </span>
        </Link>

        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-4xl leading-[1.08] text-black sm:text-[2.75rem] dark:text-zinc-50">
            {title}
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">{lede}</p>
          <div className="mt-8">{children}</div>
          {footer && (
            <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">{footer}</p>
          )}
        </main>
      </div>

      <aside className="hidden p-4 lg:block">
        <AuthAside />
      </aside>
    </div>
  )
}
