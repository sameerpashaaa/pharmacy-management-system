import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'
import { UserFormClient } from '@/components/users/user-form-client'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Add New User' }

export const dynamic = 'force-dynamic'

export default async function AddNewUserPage() {
  await requirePermission(PERMISSIONS.USERS_CREATE)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/users" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Users
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New User</h1>
        <p className="text-muted-foreground">Create a new system user with role assignment</p>
      </div>
      <Card>
        <CardContent className="p-6">
          <UserFormClient />
        </CardContent>
      </Card>
    </div>
  )
}
