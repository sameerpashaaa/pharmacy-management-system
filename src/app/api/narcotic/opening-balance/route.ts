import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { createOpeningBalance } from '@/lib/narcotic/narcotic-service'
import { openingBalanceSchema } from '@/lib/validations/narcotic'
import type { OpeningBalanceInput } from '@/lib/validations/narcotic'

export async function POST(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const authResult = await requirePermission('inventory:adjust') as { id: string; branchId: string; permissions: string[] }
    const body = await request.json()

    const parsed = openingBalanceSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const input: OpeningBalanceInput = {
      branchId: parsed.data.branchId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      batchNumber: parsed.data.batchNumber,
      expiryDate: parsed.data.expiryDate,
      manufacturingDate: parsed.data.manufacturingDate ?? null,
      purchasePrice: parsed.data.purchasePrice,
      mrp: parsed.data.mrp,
      supplierRef: parsed.data.supplierRef,
      evidenceFileId: parsed.data.evidenceFileId,
    }

    const result = await createOpeningBalance(input, {
      id: authResult.id,
      branchId: authResult.branchId,
      permissions: authResult.permissions,
    })

    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('Forbidden')) {
        return Response.json({ success: false, error: error.message }, { status: 403 })
      }
      if (error.message.startsWith('Not Found')) {
        return Response.json({ success: false, error: error.message }, { status: 404 })
      }
      if (error.message.includes('already exists')) {
        return Response.json({ success: false, error: error.message }, { status: 409 })
      }
      if (error.message.startsWith('Validation')) {
        return Response.json({ success: false, error: error.message }, { status: 400 })
      }
    }
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}