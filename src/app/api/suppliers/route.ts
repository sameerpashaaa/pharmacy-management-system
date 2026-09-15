import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createSupplier, listSuppliers } from '@/lib/purchases/purchase-service'
import { createSupplierSchema, supplierListQuerySchema } from '@/lib/validations/purchase'

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Conflict')) return 409
  return 400
}

// GET /api/suppliers
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_READ)
    const query = supplierListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listSuppliers(query, user)
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination })
  } catch (err) {
    if (err instanceof ZodError)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input', issues: err.flatten() } }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}

// POST /api/suppliers
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_CREATE)
    const body: unknown = await req.json()
    const data = createSupplierSchema.parse(body)
    const supplier = await createSupplier(data, user)
    return NextResponse.json({ success: true, data: supplier }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input', issues: err.flatten() } }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}
