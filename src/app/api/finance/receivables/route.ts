import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listReceivables } from '@/lib/finance/finance-service'
import { partyLedgerQuerySchema } from '@/lib/validations/finance'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.FINANCE_READ)
    const query = partyLedgerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listReceivables(query)
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination })
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
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
