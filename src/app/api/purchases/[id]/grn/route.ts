import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createGrn } from '@/lib/purchases/purchase-service'
import { createGrnSchema } from '@/lib/validations/purchase'

type RouteParams = { params: { id: string } }

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Conflict')) return 409
  return 400
}

// POST /api/purchases/:id/grn
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_RECEIVE)
    const body: unknown = await req.json()
    const data = createGrnSchema.parse(body)

    if (data.purchaseId !== params.id)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: 'purchaseId in body must match URL param' } }, { status: 400 })

    const command = {
      purchaseId: data.purchaseId,
      branchId: data.branchId,
      grnNumber: data.grnNumber,
      grnDate: new Date(data.grnDate),
      notes: data.notes,
      items: data.items.map((item) => ({
        purchaseItemId: item.purchaseItemId,
        receivedQuantity: item.receivedQuantity,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : undefined,
        purchasePrice: item.purchasePrice,
        mrp: item.mrp,
        coldChainTempLog: item.coldChainTempLog,
        qualityCheckPassed: item.qualityCheckPassed,
        qualityCheckNotes: item.qualityCheckNotes,
      })),
    }

    const result = await createGrn(command, user)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError)
      return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input', issues: err.flatten() } }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: errStatus(message) })
  }
}