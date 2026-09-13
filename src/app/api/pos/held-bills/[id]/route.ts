import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { deleteHeldBill } from '@/lib/sales/sales-service'

type RouteParams = { params: { id: string } }

// DELETE /api/pos/held-bills/:id
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE)

    await deleteHeldBill(params.id, user)

    return NextResponse.json({ success: true })
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
              : message.startsWith('Not Found')
                ? 404
                : 400,
      }
    )
  }
}
