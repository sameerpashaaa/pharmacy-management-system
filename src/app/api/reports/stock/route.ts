import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { ReportService } from '@/lib/reports/report-service'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.REPORTS_INVENTORY)
    const { searchParams } = new URL(req.url)
    const query = Object.fromEntries(searchParams)

    // Resolve branch scope to ensure users only see authorized branch data
    const branchId = await resolveBranchScope(user, query.branchId)
    if (!branchId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Must specify a branch or lack permissions' },
        },
        { status: 403 }
      )
    }

    const data = await ReportService.getDailyStockPosition(branchId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
