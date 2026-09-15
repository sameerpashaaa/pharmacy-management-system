import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { recordSupplierPayment } from '@/lib/purchases/purchase-service'
import { supplierPaymentSchema } from '@/lib/validations/purchase'

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Conflict')) return 409
  return 400
}

// POST /api/supplier-payments
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_PAYMENTS)
    const body: unknown = await req.json()
    const data = supplierPaymentSchema.parse(body)

    const result = await recordSupplierPayment(data, user)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError)
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

// GET /api/supplier-payments - list payment history
export async function GET(_req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.SUPPLIERS_PAYMENTS)
    // TODO: Implement list supplier payments when history tracking is added
    // For now, return empty list with pagination
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
