import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { parseDateRange, parseReportPagination } from '@/lib/reports/report-params'
import { ReportService } from '@/lib/reports/report-service'

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Validation')) return 400
  return 500
}

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

    const { startDate, endDate } = parseDateRange(query)
    const { page, limit } = parseReportPagination(query)
    const result = await ReportService.getConsumptionReport(branchId, startDate, endDate, {
      page,
      limit,
    })
    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: { page: result.page, limit: result.limit, total: result.total },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = errStatus(message)
    const code = status === 400 ? 'VALIDATION' : 'ERROR'
    return NextResponse.json({ success: false, error: { code, message } }, { status })
  }
}
