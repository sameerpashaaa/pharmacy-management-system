import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getSaleById } from '@/lib/sales/sales-service'

type RouteParams = { params: { id: string } }

// GET /api/sales/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_READ)
    const scope = await resolveBranchScope(user)

    const sale = await getSaleById(params.id, scope)

    return NextResponse.json({ success: true, data: sale })
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
