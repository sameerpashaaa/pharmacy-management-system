import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { createHeldBill, listHeldBills } from '@/lib/sales/sales-service'
import { createHeldBillSchema, heldBillListQuerySchema } from '@/lib/validations/sale'

// GET /api/pos/held-bills?branchId=&limit=
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE)
    const query = heldBillListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

    const scope = query.branchId ? await resolveBranchScope(user, query.branchId) : user.branchId
    const bills = await listHeldBills(user, scope ?? undefined)

    return NextResponse.json({ success: true, data: bills })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION', message: err.errors[0]?.message ?? 'Invalid input' },
        },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 400 }
    )
  }
}

// POST /api/pos/held-bills
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE)

    const body: unknown = await req.json()
    const data = createHeldBillSchema.parse(body)

    const bill = await createHeldBill(
      { ...data, cartData: data.cartData as Prisma.InputJsonValue },
      user
    )

    return NextResponse.json({ success: true, data: bill }, { status: 201 })
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
