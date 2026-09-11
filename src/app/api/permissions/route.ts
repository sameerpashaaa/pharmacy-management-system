import { NextResponse } from 'next/server'

import prisma from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

// GET /api/permissions
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.ROLES_MANAGE)

    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    })

    // Group by module for easier consumption by the frontend
    const grouped = permissions.reduce<
      Record<string, typeof permissions>
    >((acc, p) => {
      if (!acc[p.module]) acc[p.module] = []
      acc[p.module].push(p)
      return acc
    }, {})

    return NextResponse.json({ success: true, data: permissions, grouped })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
