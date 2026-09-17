import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getDoctors, createDoctor } from '@/lib/doctors/doctors-service'

// In a real app we'd get the organizationId from the authenticated session
const MOCK_ORG_ID = 'default-org-id' // Using a placeholder for this implementation

export async function GET(_req: NextRequest) {
  try {
    const doctors = await getDoctors(MOCK_ORG_ID)
    return NextResponse.json(doctors)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const doctor = await createDoctor({ ...body, organizationId: MOCK_ORG_ID })
    return NextResponse.json(doctor)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
