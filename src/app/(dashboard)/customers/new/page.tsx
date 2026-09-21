import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { CustomerForm } from '@/components/customers/customer-form'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Add New Customer' }

export const dynamic = 'force-dynamic'

export default async function AddNewCustomerPage() {
  await requirePermission(PERMISSIONS.CUSTOMERS_CREATE)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/customers" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Customers
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New Customer</h1>
        <p className="text-muted-foreground">Capture customer identity, contact and credit terms</p>
      </div>
      <CustomerForm mode="create" />
    </div>
  )
}
