import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getExpiredBatches } from '@/lib/batches/expiry-service'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { expiredBatchesQuerySchema } from '@/lib/validations/expiry'

// GET /api/expiry/expired?page=&limit=&search=&branchId=&productId=
// Reuses batches:read. Server-side branch scope + BATCHES_READ gate.
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.BATCHES_READ)

    const { searchParams } = new URL(req.url)
    const query = expiredBatchesQuerySchema.parse(Object.fromEntries(searchParams))
    const branchId = await resolveBranchScope(user, query.branchId)

    const result = await getExpiredBatches({
      page: query.page,
      limit: query.limit,
      search: query.search,
      productId: query.productId,
      branchId: branchId ?? undefined,
    })

    return NextResponse.json({ success: true, ...result })
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
            : message.startsWith('Conflict')
              ? 409
              : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
