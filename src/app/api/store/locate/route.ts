import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { locateProduct } from '@/lib/store/rack-service'
import { storeLocateQuerySchema } from '@/lib/validations/store'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_READ)
    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    
    const query = storeLocateQuerySchema.parse({
      ...searchParams,
      branchId: searchParams.branchId || user.branchId,
    })
    
    const data = await locateProduct(query)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
