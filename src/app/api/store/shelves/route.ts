import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createShelf } from '@/lib/store/rack-service'
import { rackShelfSchema } from '@/lib/validations/store'

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = rackShelfSchema.parse(body)
    
    const result = await createShelf(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
