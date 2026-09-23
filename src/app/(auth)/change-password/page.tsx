import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { authOptions } from '@/lib/auth/auth-config'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Change password',
}

// Page is reached either via the mustChangePassword redirect from the
// dashboard or by an authenticated user choosing to rotate their password.
export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect(ROUTES.LOGIN)
  }
  return <ChangePasswordForm />
}
