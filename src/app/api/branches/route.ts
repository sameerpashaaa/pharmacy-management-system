import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import {
  getBranches,
  createBranch,
  getOrganization,
} from '@/lib/organization/org-service'

const createBranchSchema = z.object({
  name: z.string().min(2, 'Branch name must be at least 2 characters'),
  code: z.string().optional(),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  isHeadOffice: z.boolean().default(false),
  invoicePrefix: z.string().default('INV'),
})

// GET /api/branches
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.BRANCHES_MANAGE)

    const org = await getOrganization()
    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
        { status: 404 }
      )
    }

    const branches = await getBranches(org.id)
    return NextResponse.json({ success: true, data: branches })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// POST /api/branches
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.BRANCHES_MANAGE)

    const org = await getOrganization()
    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
        { status: 404 }
      )
    }

    const body: unknown = await req.json()
    const data = createBranchSchema.parse(body)

    const branch = await createBranch(org.id, data as Parameters<typeof createBranch>[1])
    return NextResponse.json({ success: true, data: branch, message: 'Branch created' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status: 400 })
  }
}
