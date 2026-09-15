import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getCreditNoteById } from '@/lib/returns/sale-return-service'

function errStatus(msg: string) {
  if (msg === 'Unauthorized') return 401
  if (msg.startsWith('Forbidden')) return 403
  if (msg.startsWith('Not Found')) return 404
  if (msg.startsWith('Conflict')) return 409
  return 400
}

interface RouteParams {
  params: { id: string }
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await requirePermission(PERMISSIONS.RETURNS_READ)
    const note = await getCreditNoteById(params.id, user)
    return NextResponse.json({ success: true, data: note })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
