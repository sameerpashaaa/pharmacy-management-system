import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getPosSettings } from '@/lib/settings/settings-service'

// GET /api/pos/config
// POS runtime configuration for the UI (discount limit, round-off,
// credit rules, FEFO flag, invoice type). The server remains the
// authority at sale time even if this preview differs.
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SALES_CREATE)
    const config = await getPosSettings()
    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 400 }
    )
  }
}
