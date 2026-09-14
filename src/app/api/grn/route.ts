import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listGrns } from '@/lib/purchases/purchase-service'
import { grnListQuerySchema } from '@/lib/validations/purchase'

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  return 400
}

// GET /api/grn
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_READ)
    const query = grnListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listGrns(query, user)
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination })
  } catch (err) {
    if (err instanceof ZodError)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input', issues: err.flatten() } }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}