import { ChevronLeft, Shield } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { RoleForm } from '@/components/roles/role-form'
import { Badge } from '@/components/ui/badge'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

interface PageProps {
  params: { id: string }
}

export const metadata: Metadata = { title: 'Role Detail' }

export const dynamic = 'force-dynamic'

export default async function RoleDetailPage({ params }: PageProps) {
  await requirePermission(PERMISSIONS.ROLES_MANAGE)

  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
  })

  if (!role) notFound()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/roles" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Roles
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{role.displayName}</h1>
            {role.isSystem && <Badge variant="secondary">System</Badge>}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {role.name} · {role._count.userRoles} users · {role.rolePermissions.length} permissions
          </p>
        </div>
      </div>
      <RoleForm
        mode="edit"
        initial={{
          id: role.id,
          name: role.name,
          displayName: role.displayName,
          description: role.description ?? '',
          permissionIds: role.rolePermissions.map((rp) => rp.permission.id),
          isSystem: role.isSystem,
        }}
      />
    </div>
  )
}
