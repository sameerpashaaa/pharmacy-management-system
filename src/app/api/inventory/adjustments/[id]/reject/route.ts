import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import { rejectAdjustment } from '@/lib/inventory/inventory-service'

type RouteParams = { params: { id: string } }

// POST /api/inventory/adjustments/:id/reject
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT)

    const adjustment = await rejectAdjustment(params.id, user)

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REJECT',
        entity: 'StockAdjustment',
        entityId: adjustment.id,
        oldData: { status: 'PENDING' },
        newData: { status: 'REJECTED' },
      },
    })

    return NextResponse.json({
      success: true,
      data: adjustment,
      message: 'Adjustment rejected',
    })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
          },
        },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.startsWith('Not Found')
            ? 404
            : message.startsWith('Conflict')
              ? 409
              : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
