import bcrypt from 'bcryptjs'
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission, assertAssignableRoles } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { createUserSchema } from '@/lib/validations/user'

// GET /api/users
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.USERS_READ)

    const { searchParams } = new URL(req.url)
    const rawPage = searchParams.get('page') ?? '1'
    const rawLimit = searchParams.get('limit') ?? '20'
    const page = parseInt(rawPage, 10)
    const limit = parseInt(rawLimit, 10)
    const search = searchParams.get('search') ?? ''

    if (Number.isNaN(page) || page < 1) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Page must be a positive integer' } },
        { status: 400 }
      )
    }
    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Limit must be between 1 and 100' } },
        { status: 400 }
      )
    }

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
    const actor = await requirePermission(PERMISSIONS.USERS_CREATE)

    const body: unknown = await req.json()
    const data = createUserSchema.parse(body)
    await assertAssignableRoles(data.roleIds)

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Email already in use' } },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
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

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        newData: { email: user.email, name: user.name },
      },
    })

    return NextResponse.json({ success: true, data: user, message: 'User created successfully' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}
