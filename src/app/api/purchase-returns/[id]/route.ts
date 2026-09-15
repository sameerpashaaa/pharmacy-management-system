import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getPurchaseReturnById } from '@/lib/purchases/purchase-service'

type RouteParams = { params: { id: string } }

// GET /api/purchase-returns/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_READ)
    const purchaseReturn = await getPurchaseReturnById(params.id, user)

    if (!purchaseReturn) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Purchase return not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: purchaseReturn })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      {
        status:
          message === 'Unauthorized'
            ? 401
            : message.startsWith('Forbidden')
              ? 403
              : 400,
      }
    )
  }
}
