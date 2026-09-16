import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getBatchById, updateBatch } from '@/lib/batches/batch-service'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import { updateBatchSchema } from '@/lib/validations/batch'

type RouteParams = { params: { id: string } }

// GET /api/batches/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.BATCHES_READ)

    const batch = await getBatchById(params.id, user)
    if (!batch) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Batch not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: batch })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PATCH /api/batches/:id
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.BATCHES_UPDATE)

    const existing = await getBatchById(params.id, user)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Batch not found' } },
        { status: 404 }
      )
    }

    const body: unknown = await req.json()
    const data = updateBatchSchema.parse(body)

    const batch = await updateBatch(params.id, data, user)

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'Batch',
        entityId: params.id,
      },
    })

    return NextResponse.json({
      success: true,
      data: batch,
      message: 'Batch updated successfully',
    })
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
              : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
