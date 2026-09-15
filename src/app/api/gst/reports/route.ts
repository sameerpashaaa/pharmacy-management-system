import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getGstSummary } from '@/lib/finance/finance-service'
import { gstReportQuerySchema } from '@/lib/validations/finance'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.GST_READ)
    const query = gstReportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const data = await getGstSummary(query, user)
    return NextResponse.json({ success: true, data })
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
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.startsWith('Not Found')
            ? 404
            : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
