import { NextResponse } from 'next/server'

import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getCustomer, updateCustomer } from '@/lib/customers/customer-service'
import { customerSchema } from '@/lib/validations/customer'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await can(PERMISSIONS.CUSTOMERS_READ))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await getCustomer(params.id, session.user)
    if (!result) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await can(PERMISSIONS.CUSTOMERS_UPDATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = customerSchema.parse(body)
    const result = await updateCustomer(params.id, parsed, session.user)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
