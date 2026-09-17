import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { deleteDoctor, getDoctorById, updateDoctor } from '@/lib/doctors/doctors-service'

type RouteParams = { params: { id: string } }

const doctorUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  mciNumber: z.string().max(80).optional(),
  specialization: z.string().max(120).optional(),
  clinicName: z.string().max(120).optional(),
  clinicAddress: z.string().max(250).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email('Please enter a valid email address').optional(),
  isActive: z.boolean().optional(),
})

function errStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Not Found')) return 404
  if (message.startsWith('Conflict')) return 409
  return 400
}

async function resolveOrganizationId(user: { id: string; branchId: string | null }): Promise<string> {
  if (!user.branchId) throw new Error('Forbidden: no branch assignment')
  const branch = await prisma.branch.findUnique({
    where: { id: user.branchId },
    select: { organizationId: true },
  })
  if (!branch) throw new Error('Not Found: branch')
  return branch.organizationId
}

// GET /api/doctors/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.DOCTORS_READ)
    const organizationId = await resolveOrganizationId(user)
    const doctor = await getDoctorById(params.id, organizationId)
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Doctor not found' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ success: true, data: doctor })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

// PUT /api/doctors/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.DOCTORS_UPDATE)
    const body: unknown = await req.json()
    const data = doctorUpdateSchema.parse(body)
    const organizationId = await resolveOrganizationId(user)
    const doctor = await updateDoctor(params.id, organizationId, data)
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'UPDATE', entity: 'Doctor', entityId: doctor.id },
    })
    return NextResponse.json({ success: true, data: doctor })
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

// DELETE /api/doctors/:id
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.DOCTORS_DELETE)
    const organizationId = await resolveOrganizationId(user)
    await deleteDoctor(params.id, organizationId)
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'DELETE', entity: 'Doctor', entityId: params.id },
    })
    return NextResponse.json({ success: true, message: 'Doctor deleted successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
