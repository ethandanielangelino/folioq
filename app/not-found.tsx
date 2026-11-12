import Link from 'next/link'
import { GuestOnly, MemberOnly } from '@/app/components/session'
import SiteFooter from '@/app/components/site-footer'
import SiteHeader from '@/app/components/site-header'
import { outlineButton, primaryButton } from '@/app/components/styles'

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20 sm:px-10">
        <h1 className="max-w-2xl text-5xl leading-[1.05] text-black sm:text-6xl dark:text-zinc-50">
          That page isn&apos;t here
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          The address may be mistyped, or the page was removed. If you followed a share link, the
          owner may have turned sharing off.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <MemberOnly>
            <Link href="/dashboard" className={`${primaryButton} px-6 py-3`}>
              Open your portfolios
            </Link>
            <Link href="/" className={`${outlineButton} px-6 py-3`}>
              Go to the home page
            </Link>
          </MemberOnly>
          <GuestOnly>
            <Link href="/" className={`${primaryButton} px-6 py-3`}>
              Go to the home page
            </Link>
            <Link href="/login" className={`${outlineButton} px-6 py-3`}>
              Log in
            </Link>
          </GuestOnly>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
