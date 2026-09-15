import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createLedgerEntry } from '@/lib/finance/finance-service'
import { createLedgerEntrySchema } from '@/lib/validations/finance'

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE)
    const body: unknown = await req.json()
    const data = createLedgerEntrySchema.parse(body)
    const entry = await createLedgerEntry(data, user)
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
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
            : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
