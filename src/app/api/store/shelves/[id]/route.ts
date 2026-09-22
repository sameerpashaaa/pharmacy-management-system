/* eslint-disable */
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { updateShelf, deleteShelf } from '@/lib/store/rack-service'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateShelf(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteShelf(params.id)
    return NextResponse.json({ success: true, message: 'Shelf deleted' })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
