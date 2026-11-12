import AppFrame, { type FramePortfolio } from '@/app/components/app/app-frame'
import { ToastProvider } from '@/app/components/toast'

/**
 * Frame for every signed-in page: sidebar, top bar, and the page itself. It
 * has no "log in" or "create account" anywhere, because the person looking at
 * it already has, and every link in it stays inside the signed-in app.
 */
export default function AppShell({
  user,
  portfolios,
  invites,
  children,
}: {
  user: { email: string; name: string | null }
  portfolios: FramePortfolio[]
  /** Unanswered invitations to other people's portfolios. */
  invites: number
  children: React.ReactNode
}) {
  return (
    <ToastProvider>
      <AppFrame user={user} portfolios={portfolios} invites={invites}>
        {children}
      </AppFrame>
    </ToastProvider>
  )
}
