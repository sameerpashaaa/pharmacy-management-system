// ─────────────────────────────────────────────────────────────
// API — /api/customers/[id]
// ─────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { deleteCustomer, getCustomer, updateCustomer } from '@/lib/customers/customer-service'
import { updateCustomerSchema } from '@/lib/validations/customer'

type RouteParams = { params: { id: string } }

function errStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Not Found')) return 404
  if (message.startsWith('Conflict')) return 409
  return 400
}

// GET /api/customers/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ)
    const customer = await getCustomer(params.id, user)
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ success: true, data: customer })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

// PUT /api/customers/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_UPDATE)
    const body: unknown = await req.json()
    const data = updateCustomerSchema.parse(body)
    const customer = await updateCustomer(params.id, data, user)
    return NextResponse.json({ success: true, data: customer })
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
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

// DELETE /api/customers/:id
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_DELETE)
    await deleteCustomer(params.id, user)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
