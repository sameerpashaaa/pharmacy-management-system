import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { blockBatch } from '@/lib/batches/batch-service'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import { blockBatchSchema } from '@/lib/validations/batch'

type RouteParams = { params: { id: string } }

// POST /api/batches/:id/block
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.BATCHES_BLOCK)

    const body: unknown = await req.json()
    const data = blockBatchSchema.parse(body)

    const batch = await blockBatch(params.id, data.reason, user)

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'BLOCK',
        entity: 'Batch',
        entityId: params.id,
        metadata: { reason: data.reason },
      },
    })

    return NextResponse.json({
      success: true,
      data: batch,
      message: 'Batch blocked successfully',
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
