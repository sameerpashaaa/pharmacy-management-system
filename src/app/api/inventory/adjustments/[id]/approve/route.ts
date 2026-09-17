import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import { approveAdjustment } from '@/lib/inventory/inventory-service'
import { approveAdjustmentSchema } from '@/lib/validations/inventory'

type RouteParams = { params: { id: string } }

// POST /api/inventory/adjustments/:id/approve
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT)

    let evidenceFileId: string | null | undefined
    try {
      const body: unknown = await req.json()
      const parsed = approveAdjustmentSchema.parse(body)
      evidenceFileId = parsed.evidenceFileId ?? undefined
    } catch {
      // No body or invalid JSON — treat as no evidence (validation will happen in service for CHIEF)
    }

    const adjustment = await approveAdjustment(params.id, user, evidenceFileId ?? null)

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'APPROVE',
        entity: 'StockAdjustment',
        entityId: adjustment.id,
        oldData: { status: 'PENDING' },
        newData: {
          status: 'APPROVED',
          approvedById: user.id,
          quantity: adjustment.quantity,
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: adjustment,
      message: 'Adjustment approved and applied',
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
              : message.startsWith('Insufficient')
                ? 400
                : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
