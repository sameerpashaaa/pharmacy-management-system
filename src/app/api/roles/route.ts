import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { createRoleSchema } from '@/lib/validations/user'

// GET /api/roles
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const roles = await prisma.role.findMany({
      orderBy: { isSystem: 'desc' },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    })

    return NextResponse.json({ success: true, data: roles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 500 })
  }
}

// POST /api/roles
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const body: unknown = await req.json()
    const data = createRoleSchema.parse(body)

    const existing = await prisma.role.findUnique({ where: { name: data.name } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Role name already exists' } },
        { status: 409 }
      )
    }

    const role = await prisma.role.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        rolePermissions: {
          create: data.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    })

    return NextResponse.json({ success: true, data: role, message: 'Role created' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}
