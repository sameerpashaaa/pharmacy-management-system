import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getCategoryOptions } from '@/lib/products/product-service'

// GET /api/categories/options — flat active list for form selects
export async function GET(_req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.PRODUCTS_READ)

    const data = await getCategoryOptions()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
