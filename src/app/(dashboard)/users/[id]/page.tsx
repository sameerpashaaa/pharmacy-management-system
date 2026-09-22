import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, CardContent } from '@/components/ui/card'
import { UserFormClient } from '@/components/users/user-form-client'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

interface PageProps {
  params: { id: string }
}

export const metadata: Metadata = { title: 'User Detail' }

export const dynamic = 'force-dynamic'

export default async function UserDetailPage({ params }: PageProps) {
  await requirePermission(PERMISSIONS.USERS_READ)

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      userRoles: {
        include: { role: { select: { id: true, name: true, displayName: true } } },
      },
    },
  })

  if (!user) notFound()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/users" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Users
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
        <p className="text-muted-foreground">{user.email}</p>
      </div>
      <Card>
        <CardContent className="p-6">
          <UserFormClient
            initialData={{
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              isActive: user.isActive,
              userRoles: user.userRoles,
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
