import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createLedger, listLedgers } from '@/lib/finance/finance-service'
import { createLedgerSchema, ledgerListQuerySchema } from '@/lib/validations/finance'

function statusFor(message: string) {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Not Found')) return 404
  if (message.includes('Unique constraint')) return 409
  return 400
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.FINANCE_READ)
    const query = ledgerListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listLedgers(query)
    return NextResponse.json({
      success: true,
      data: result.data,
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
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: statusFor(message) }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE)
    const body: unknown = await req.json()
    const data = createLedgerSchema.parse(body)
    const ledger = await createLedger(data, user)
    return NextResponse.json({ success: true, data: ledger }, { status: 201 })
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
