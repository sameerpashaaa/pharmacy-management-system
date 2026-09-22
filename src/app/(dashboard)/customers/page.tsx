import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { CustomersView } from '@/components/customers/customers-view'
import { Button } from '@/components/ui/button'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listCustomers } from '@/lib/customers/customer-service'

export const metadata: Metadata = { title: 'Customer Management' }

export const dynamic = 'force-dynamic'

export default async function CustomerManagementPage() {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ)
  const initial = await listCustomers({ page: 1, limit: 20 }, user)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Management</h1>
          <p className="text-muted-foreground">
            {initial.pagination.total} customer{initial.pagination.total === 1 ? '' : 's'}{' '}
            registered
          </p>
        </div>
        <Button asChild>
          <Link href="/customers/new">
            <Plus className="mr-2 h-4 w-4" /> New Customer
          </Link>
        </Button>
      </div>
      <CustomersView initialData={initial.data as never} initialPagination={initial.pagination} />
    </div>
  )
}
