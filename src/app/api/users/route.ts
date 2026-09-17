import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { recordPasswordHistory } from '@/lib/auth/password-history'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { createUserSchema } from '@/lib/validations/user'

// GET /api/users
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.USERS_READ)

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')
    const search = searchParams.get('search') ?? ''
    const skip = (page - 1) * limit

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          branchId: true,
          userRoles: {
            include: { role: { select: { id: true, name: true, displayName: true } } },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// POST /api/users
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.USERS_CREATE)

    const body: unknown = await req.json()
    const data = createUserSchema.parse(body)

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Email already in use' } },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          phone: data.phone,
          branchId: data.branchId,
          isActive: data.isActive,
          userRoles: {
            create: data.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: {
          userRoles: { include: { role: true } },
        },
      })
      await recordPasswordHistory(tx, created.id, hashedPassword)
      return created
    })

    // Audit
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        newData: { email: user.email, name: user.name },
      },
    })

    return NextResponse.json(
      { success: true, data: user, message: 'User created successfully' },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}
