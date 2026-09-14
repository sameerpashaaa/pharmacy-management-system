import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getPurchase, updatePurchase } from '@/lib/purchases/purchase-service'
import { updatePurchaseSchema } from '@/lib/validations/purchase'

type RouteParams = { params: { id: string } }

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Conflict')) return 409
  return 400
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_READ)
    const purchase = await getPurchase(params.id, user)
    if (!purchase)
      return NextResponse.json({ success: false, error: { code: 'ERROR', message: 'Not Found: purchase' } }, { status: 404 })
    return NextResponse.json({ success: true, data: purchase })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_UPDATE)
    const body: unknown = await req.json()
    const data = updatePurchaseSchema.parse(body)
    const purchase = await updatePurchase(params.id, data, user)
    return NextResponse.json({ success: true, data: purchase })
  } catch (err) {
    if (err instanceof ZodError)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input', issues: err.flatten() } }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}