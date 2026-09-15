import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import {
  getPrescriptionById,
  updatePrescription,
} from '@/lib/prescriptions/prescription-service'
import { updatePrescriptionSchema } from '@/lib/validations/prescription'

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
    const user = await requirePermission(PERMISSIONS.PRESCRIPTIONS_READ)
    const prescription = await getPrescriptionById(params.id, user)
    return NextResponse.json({ success: true, data: prescription })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await requirePermission(PERMISSIONS.PRESCRIPTIONS_CREATE)
    const body: unknown = await req.json()
    const data = updatePrescriptionSchema.parse(body)
    const updated = await updatePrescription(params.id, data, user)
    return NextResponse.json({ success: true, data: updated })
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
