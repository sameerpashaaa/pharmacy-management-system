import { NextResponse, type NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getLedgerById } from '@/lib/finance/finance-service'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePermission(PERMISSIONS.FINANCE_READ)
    const ledger = await getLedgerById(params.id)
    return NextResponse.json({ success: true, data: ledger })
  } catch (err) {
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