import type { Metadata } from 'next'

import { getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'POS — Billing' }

export default async function PosPage() {
  const session = await getSession()

  const isOwnerOrAdmin =
    session?.user?.roles?.includes('owner') || session?.user?.roles?.includes('admin')
  const hasAccess =
    session?.user &&
    (isOwnerOrAdmin || session.user.permissions.includes(PERMISSIONS.SALES_CREATE))

  if (!hasAccess) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">🛒</div>
          <h1 className="mb-2 text-2xl font-bold">Point of Sale</h1>
          <p className="text-muted-foreground">
            You do not have permission to create sales. Ask an administrator for the{' '}
            <code className="rounded bg-muted px-1 py-0.5">sales:create</code> permission.
          </p>
        </div>
      </div>
    )
  }

  // The actual POS UI is rendered via PosContainer in the dashboard layout.
  // This page just acts as an anchor for the route so it highlights in the sidebar
  // and gives Next.js a page to render underneath the absolute overlay.
  return <div className="hidden">POS</div>
}
