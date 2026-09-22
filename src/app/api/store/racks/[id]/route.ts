/* eslint-disable */
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getRack, updateRack, deleteRack } from '@/lib/store/rack-service'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_READ)
    const data = await getRack(params.id)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateRack(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteRack(params.id)
    return NextResponse.json({ success: true, message: 'Rack deleted' })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
