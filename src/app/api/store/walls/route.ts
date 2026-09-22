import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getWalls, createWall } from '@/lib/store/rack-service'
import { wallSchema } from '@/lib/validations/store'

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_READ)
    const branchId = req.nextUrl.searchParams.get('branchId') || user.branchId
    if (!branchId) throw new Error('Branch ID required')
    
    const data = await getWalls(branchId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = wallSchema.parse(body)
    
    const result = await createWall(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
