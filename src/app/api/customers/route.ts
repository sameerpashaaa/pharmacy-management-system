import { NextResponse } from 'next/server'

import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { createCustomer, listCustomers } from '@/lib/customers/customer-service'
import { customerListQuerySchema, customerSchema } from '@/lib/validations/customer'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await can(PERMISSIONS.CUSTOMERS_READ))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const query = {
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      search: searchParams.get('search') || undefined,
    }

    const parsed = customerListQuerySchema.parse(query)
    const result = await listCustomers(parsed, session.user)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await can(PERMISSIONS.CUSTOMERS_CREATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = customerSchema.parse(body)
    const result = await createCustomer(parsed, session.user)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
