import type { Metadata } from 'next'

import { RolesView } from '@/components/roles/roles-view'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Roles & Permissions' }

export const dynamic = 'force-dynamic'

export default async function RolesPermissionsPage() {
  await requirePermission(PERMISSIONS.ROLES_MANAGE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
        <p className="text-muted-foreground">
          Manage roles, system and custom. Assign permission sets to roles.
        </p>
      </div>
      <RolesView />
    </div>
  )
}
