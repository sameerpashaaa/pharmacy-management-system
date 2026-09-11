import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getBranchById, updateBranch, deleteBranch } from '@/lib/organization/org-service'

const updateBranchSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().optional(),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  isHeadOffice: z.boolean().optional(),
  isActive: z.boolean().optional(),
  invoicePrefix: z.string().optional(),
})

type Params = { params: { id: string } }

// GET /api/branches/[id]
export async function GET(_: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.BRANCHES_MANAGE)

    const branch = await getBranchById(params.id)
    if (!branch) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Branch not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: branch })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PUT /api/branches/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.BRANCHES_MANAGE)

    const body: unknown = await req.json()
    const data = updateBranchSchema.parse(body)

    const branch = await updateBranch(params.id, data)
    return NextResponse.json({ success: true, data: branch, message: 'Branch updated' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}

// DELETE /api/branches/[id]
export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.BRANCHES_MANAGE)

    const branch = await deleteBranch(params.id)
    return NextResponse.json({ success: true, data: branch, message: 'Branch deactivated' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
