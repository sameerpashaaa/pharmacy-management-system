import type { Metadata } from 'next'

import { UsersView } from '@/components/users/users-view'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'User Management' }

export const dynamic = 'force-dynamic'

export default async function UserManagementPage() {
  await requirePermission(PERMISSIONS.USERS_READ)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Manage system users and their role assignments</p>
      </div>
      <UsersView />
    </div>
  )
}
