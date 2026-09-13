import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { createSale, listSales } from '@/lib/sales/sales-service'
import { createSaleSchema, saleListQuerySchema } from '@/lib/validations/sale'

// GET /api/sales?page=&limit=&search=&branchId=&status=&paymentStatus=
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_READ)
    const query = saleListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))

    const scope = await resolveBranchScope(user, query.branchId)
    const result = await listSales(query, scope)

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
    return NextResponse.json(
      {
        success: false,
        error: { code: 'ERROR', message },
      },
      {
        status:
          message === 'Unauthorized'
            ? 401
            : message.startsWith('Forbidden')
              ? 403
              : message.startsWith('Not Found')
                ? 404
                : message.startsWith('Conflict')
                  ? 409
                  : 400,
      }
    )
  }
}

// POST /api/sales
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE)

    const body: unknown = await req.json()
    const data = createSaleSchema.parse(body)

    const sale = await createSale(data, user)

    return NextResponse.json({ success: true, data: sale }, { status: 201 })
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
                : message.startsWith('Insufficient')
                  ? 400
                  : message.startsWith('Conflict')
                    ? 409
                    : 400,
      }
    )
  }
}
