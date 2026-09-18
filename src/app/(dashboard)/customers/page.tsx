import type { Metadata } from 'next'

import type { CustomerRow } from '@/components/customers/customers-table'
import { CustomersView } from '@/components/customers/customers-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listCustomers } from '@/lib/customers/customer-service'
import { customerListQuerySchema } from '@/lib/validations/customer'

export const metadata: Metadata = { title: 'Customer Management' }

export default async function CustomerManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.CUSTOMERS_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Management</h1>
          <p className="text-muted-foreground">Manage customer database and credit accounts</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view customers.</p>
        </div>
      </div>
    )
  }

  const defaultQuery = customerListQuerySchema.parse({ page: 1, limit: 20 })
  const firstPage = await listCustomers(defaultQuery, session.user)

  const initialRows: CustomerRow[] = firstPage.data.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    creditDays: c.creditDays,
    outstandingBalance: c.outstandingBalance.toString(),
    isActive: c.isActive,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Management</h1>
        <p className="text-muted-foreground">Manage customer database and credit accounts</p>
      </div>
      <CustomersView initialRows={initialRows} initialPagination={firstPage.pagination} />
    </div>
  )
}
