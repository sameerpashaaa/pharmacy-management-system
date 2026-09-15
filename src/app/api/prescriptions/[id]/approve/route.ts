import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { approvePrescription } from '@/lib/prescriptions/prescription-service'
import { approvePrescriptionSchema } from '@/lib/validations/prescription'

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

export async function POST(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await requirePermission(PERMISSIONS.PRESCRIPTIONS_APPROVE)
    let body = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional for approve
    }
    const data = approvePrescriptionSchema.parse(body)
    const approved = await approvePrescription(params.id, data, user)
    return NextResponse.json({ success: true, data: approved })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
            issues: err.flatten(),
          },
        },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
