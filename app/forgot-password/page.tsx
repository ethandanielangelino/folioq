import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthShell from '@/app/components/auth-shell'
import { textLink } from '@/app/components/styles'
import ForgotPasswordForm from '@/app/forgot-password/forgot-password-form'
import { getSessionUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Reset your password — FolioQ' }

export default async function ForgotPasswordPage() {
  // Signed-in people change their password from account settings instead.
  if (await getSessionUser()) redirect('/account')

  return (
    <AuthShell
      title="Reset your password"
      lede="Enter the email you signed up with and we’ll send a link to choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className={textLink}>
            Back to log in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
