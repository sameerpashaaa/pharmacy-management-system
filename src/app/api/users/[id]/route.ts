import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { isPasswordReused, recordPasswordHistory } from '@/lib/auth/password-history'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { passwordSchema, updateUserSchema } from '@/lib/validations/user'

type RouteParams = { params: { id: string } }

// GET /api/users/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.USERS_READ)

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        branchId: true,
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: user })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 500 })
  }
}

// PUT /api/users/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.USERS_UPDATE)

    const body: unknown = await req.json()
    const data = updateUserSchema.parse(body)

    const user = await prisma.user.findUnique({ where: { id: params.id } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      )
    }

    // Handle password change (validated against policy + last-5 history)
    const bodyWithPwd = body as { password?: string }
    let newPasswordHash: string | undefined
    if (bodyWithPwd.password) {
      const parsed = passwordSchema.safeParse(bodyWithPwd.password)
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION',
              message: parsed.error.errors[0]?.message ?? 'Invalid password',
            },
          },
          { status: 400 }
        )
      }
      if (await isPasswordReused(params.id, bodyWithPwd.password)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION',
              message: 'Password must not match any of the last 5 passwords',
            },
          },
          { status: 400 }
        )
      }
      newPasswordHash = await bcrypt.hash(bodyWithPwd.password, 12)
    }

    // Handle role updates
    if (data.roleIds) {
      await prisma.userRole.deleteMany({ where: { userId: params.id } })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: params.id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.branchId !== undefined && { branchId: data.branchId }),
          ...(newPasswordHash && { password: newPasswordHash }),
          ...(data.roleIds && {
            userRoles: { create: data.roleIds.map((roleId) => ({ roleId })) },
          }),
        },
        include: { userRoles: { include: { role: true } } },
      })
      if (newPasswordHash) {
        await recordPasswordHistory(tx, params.id, newPasswordHash)
      }
      return result
    })

    await prisma.auditLog.create({
      data: { action: 'UPDATE', entity: 'User', entityId: params.id },
    })

    return NextResponse.json({ success: true, data: updated, message: 'User updated successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}

// DELETE /api/users/:id
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.USERS_DELETE)

    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: { action: 'DELETE', entity: 'User', entityId: params.id },
    })

    return NextResponse.json({ success: true, message: 'User deactivated successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 500 })
  }
}
