/* eslint-disable */
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getBin, updateBin, deleteBin, assignStockToBin } from '@/lib/store/rack-service'
import { assignStockSchema } from '@/lib/validations/store'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_READ)
    const data = await getBin(params.id)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    const body = await req.json()
    const data = await updateBin(params.id, body)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requirePermission(PERMISSIONS.STORE_ASSIGN)
    const body = await req.json()
    const data = assignStockSchema.parse(body)
    
    const result = await assignStockToBin(params.id, data, user.id)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(PERMISSIONS.STORE_MANAGE)
    await deleteBin(params.id)
    return NextResponse.json({ success: true, message: 'Bin deleted' })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 })
  }
}
