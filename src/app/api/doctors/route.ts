import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { createDoctor, getDoctors } from '@/lib/doctors/doctors-service'

const doctorInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  registrationNo: z.string().min(1, 'Registration number is required').max(80),
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

// GET /api/doctors
export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.DOCTORS_READ)
    const organizationId = await resolveOrganizationId(user)
    const doctors = await getDoctors(organizationId)
    return NextResponse.json({ success: true, data: doctors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}

// POST /api/doctors
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.DOCTORS_CREATE)
    const body: unknown = await req.json()
    const data = doctorInputSchema.parse(body)
    const organizationId = await resolveOrganizationId(user)
    const doctor = await createDoctor({ ...data, organizationId })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entity: 'Doctor',
        entityId: doctor.id,
        newData: { name: doctor.name, registrationNo: doctor.registrationNo },
      },
    })
    return NextResponse.json({ success: true, data: doctor }, { status: 201 })
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
