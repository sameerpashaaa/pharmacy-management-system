import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createRack } from '@/lib/store/rack-service'
import { rackSchema } from '@/lib/validations/store'

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = rackSchema.parse(body)
    
    const result = await createRack(data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
