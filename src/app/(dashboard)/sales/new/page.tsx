import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { listCustomers } from '@/lib/customers/customer-service'
import { getAccessibleBranches } from '@/lib/inventory/branch-access'

import { WholesaleInvoiceClient } from './wholesale-invoice-client'

export const metadata: Metadata = { title: 'New Wholesale Invoice' }

export const dynamic = 'force-dynamic'

export default async function NewWholesaleSalePage() {
  const user = await requirePermission(PERMISSIONS.SALES_CREATE)

  // All accessible customers — client filters to WHOLESALE only.
  // Wholesale customers get the credit-sale path; retail flow lives in /pos.
  const customerResult = await listCustomers({ page: 1, limit: 100 }, user)
  const wholesaleCustomers = customerResult.data
    .filter((c) => c.customerType === 'WHOLESALE')
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: c.creditLimit,
      outstandingBalance: c.outstandingBalance,
      creditDays: c.creditDays,
    }))

  const branches = await getAccessibleBranches(user)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Wholesale Invoice</h1>
          <p className="text-muted-foreground">
            Sell medicines in bulk to a wholesale / medical-shop customer. Pick a specific batch per
            line so near-expiry stock can be cleared first.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={ROUTES.SALES}>
            <Plus className="mr-2 h-4 w-4" /> Sales History
          </Link>
        </Button>
      </div>
      <WholesaleInvoiceClient
        branches={branches}
        wholesaleCustomers={wholesaleCustomers}
        defaultBranchId={user.branchId ?? branches[0]?.id ?? ''}
      />
    </div>
  )
}
