import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getFinanceSummary } from '@/lib/finance/finance-service'
import { financeDateRangeSchema } from '@/lib/validations/finance'

function statusFor(message: string) {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Not Found')) return 404
  return 500
}

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.FINANCE_READ)
    const query = financeDateRangeSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const data = await getFinanceSummary(query, user)
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
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: statusFor(message) }
    )
  }
}
