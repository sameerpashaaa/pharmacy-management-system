import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import { assertBranchAccess, resolveBranchScope } from '@/lib/inventory/branch-access'
import { createAdjustment, getAdjustments } from '@/lib/inventory/inventory-service'
import { adjustmentListQuerySchema, createAdjustmentSchema } from '@/lib/validations/inventory'

// GET /api/inventory/adjustments?page=&limit=&search=&branchId=&productId=&status=&adjustmentType=
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.INVENTORY_READ)

    const { searchParams } = new URL(req.url)
    const query = adjustmentListQuerySchema.parse(Object.fromEntries(searchParams))
    const branchId = await resolveBranchScope(user, query.branchId)

    const result = await getAdjustments({
      page: query.page,
      limit: query.limit,
      search: query.search,
      branchId: branchId ?? undefined,
      productId: query.productId,
      status: query.status,
      adjustmentType: query.adjustmentType,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
            issues: err.flatten(),
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
              : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// POST /api/inventory/adjustments
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.INVENTORY_ADJUST)

    const body: unknown = await req.json()
    const data = createAdjustmentSchema.parse(body)

    await assertBranchAccess(user, data.branchId)

    const adjustment = await createAdjustment(
      {
        branchId: data.branchId,
        productId: data.productId,
        batchId: data.batchId,
        adjustmentType: data.adjustmentType,
        quantity: data.quantity,
        reason: data.reason,
        notes: data.notes,
        evidenceFileId: data.evidenceFileId ?? null,
      },
      user
    )

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entity: 'StockAdjustment',
        entityId: adjustment.id,
        newData: {
          branchId: adjustment.branchId,
          productId: adjustment.productId,
          quantity: adjustment.quantity,
          adjustmentType: adjustment.adjustmentType,
          status: adjustment.status,
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: adjustment,
        message:
          adjustment.status === 'APPROVED'
            ? 'Adjustment applied (auto-approved)'
            : 'Adjustment submitted for approval',
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
            issues: err.flatten(),
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
