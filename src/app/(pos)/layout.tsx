import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth/auth-helpers'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'POS — Billing' }

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session) {
    redirect(ROUTES.LOGIN)
  }

  return <div className="h-screen overflow-hidden bg-background">{children}</div>
}
