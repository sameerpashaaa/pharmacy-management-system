import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getDoctorById, updateDoctor, deleteDoctor } from '@/lib/doctors/doctors-service'

const MOCK_ORG_ID = 'default-org-id'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await getDoctorById(params.id, MOCK_ORG_ID)
    if (!doctor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(doctor)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const doctor = await updateDoctor(params.id, MOCK_ORG_ID, body)
    return NextResponse.json(doctor)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteDoctor(params.id, MOCK_ORG_ID)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
