import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { updateRoleSchema } from '@/lib/validations/user'

type RouteParams = { params: { id: string } }

// GET /api/roles/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const role = await prisma.role.findUnique({
      where: { id: params.id },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    })
    if (!role) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: role })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PUT /api/roles/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const existing = await prisma.role.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, isSystem: true },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } },
        { status: 404 }
      )
    }

    const body: unknown = await req.json()
    const data = updateRoleSchema.parse(body)

    if (existing.isSystem && data.name && data.name !== existing.name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'System role name cannot be changed' } },
        { status: 400 }
      )
    }

    if (data.name && data.name !== existing.name) {
      const conflict = await prisma.role.findUnique({ where: { name: data.name } })
      if (conflict) {
        return NextResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'Role name already exists' } },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: params.id } })
      }

      const result = await tx.role.update({
        where: { id: params.id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.displayName && { displayName: data.displayName }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.permissionIds && {
            rolePermissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
          }),
        },
        include: {
          rolePermissions: { include: { permission: true } },
          _count: { select: { userRoles: true } },
        },
      })

      return result
    })

    return NextResponse.json({ success: true, data: updated, message: 'Role updated successfully' })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input' } },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// DELETE /api/roles/:id
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const existing = await prisma.role.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { userRoles: true } },
      },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } },
        { status: 404 }
      )
    }
    if (existing.isSystem) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'System roles cannot be deleted' } },
        { status: 400 }
      )
    }
    if (existing._count.userRoles > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Cannot delete a role that has assigned users' } },
        { status: 409 }
      )
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: params.id } }),
      prisma.role.delete({ where: { id: params.id } }),
    ])

    return NextResponse.json({ success: true, message: 'Role deleted successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}