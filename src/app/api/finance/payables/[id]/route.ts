import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getSupplierLedgerStatement } from '@/lib/finance/finance-service'
import { partyStatementQuerySchema } from '@/lib/validations/finance'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.FINANCE_READ)
    const query = partyStatementQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await getSupplierLedgerStatement(params.id, query)
    return NextResponse.json({
      success: true,
      data: result.supplier,
      entries: result.entries,
      pagination: result.pagination,
    })
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
