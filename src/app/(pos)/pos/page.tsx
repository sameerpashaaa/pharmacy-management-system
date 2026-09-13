import type { Metadata } from 'next'

import { PosClient } from '@/components/pos/pos-client'
import { getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getAccessibleBranches } from '@/lib/inventory/branch-access'
import { getPosSettings } from '@/lib/settings/settings-service'

export const metadata: Metadata = { title: 'POS — Billing' }

async function ensurePosAccess(): Promise<
  { ok: true; user: { id: string; branchId: string | null; permissions: string[] } } | { ok: false }
> {
  const session = await getSession()
  if (!session?.user) return { ok: false }
  if (!session.user.permissions.includes(PERMISSIONS.SALES_CREATE)) return { ok: false }
  return {
    ok: true,
    user: {
      id: session.user.id,
      branchId: session.user.branchId,
      permissions: session.user.permissions,
    },
  }
}

export default async function PosPage() {
  const [access, settings, branches] = await Promise.all([
    ensurePosAccess(),
    getPosSettings(),
    getSession().then((s) =>
      s?.user ? getAccessibleBranches({ id: s.user.id, branchId: s.user.branchId }) : []
    ),
  ])

  if (!access.ok) {
    return (
      <div className="flex h-full items-center justify-center">
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

  return (
    <PosClient
      user={access.user}
      branches={branches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
      initialConfig={settings}
    />
  )
}
