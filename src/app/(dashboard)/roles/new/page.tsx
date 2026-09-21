import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { RoleForm } from '@/components/roles/role-form'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Add New Role' }

export const dynamic = 'force-dynamic'

export default async function AddNewRolePage() {
  await requirePermission(PERMISSIONS.ROLES_MANAGE)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/roles" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Roles
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New Role</h1>
        <p className="text-muted-foreground">Define role identity and grant permissions</p>
      </div>
      <RoleForm mode="create" />
    </div>
  )
}
