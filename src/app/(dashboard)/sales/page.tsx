import { Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import type { SalesRow } from '@/components/sales/sales-table'
import { SalesView } from '@/components/sales/sales-view'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { listSales } from '@/lib/sales/sales-service'

export const metadata: Metadata = { title: 'Sales History' }

export default async function SalesHistoryPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.SALES_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
          <p className="text-muted-foreground">View all completed sales and invoices</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view sales.</p>
        </div>
      </div>
    )
  }

  const scope = await resolveBranchScope(session.user)
  const firstPage = await listSales({ page: 1, limit: 20 }, scope)

  const initialRows: SalesRow[] = firstPage.data.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    saleDate: s.saleDate.toISOString(),
    status: s.status,
    paymentStatus: s.paymentStatus,
    totalAmount: s.totalAmount.toString(),
    amountPaid: s.amountPaid.toString(),
    balanceDue: s.balanceDue.toString(),
    customer: s.customer
      ? { id: s.customer.id, name: s.customer.name, phone: s.customer.phone }
      : null,
    createdBy: s.createdBy ? { id: s.createdBy.id, name: s.createdBy.name } : null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
          <p className="text-muted-foreground">View all completed sales and invoices</p>
        </div>
        <div className="flex gap-2">
          {session.user.permissions?.includes(PERMISSIONS.SALES_CREATE) && (
            <Button asChild variant="outline">
              <Link href={ROUTES.SALES_NEW}>
                <Truck className="mr-2 h-4 w-4" /> Wholesale Invoice
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href={ROUTES.POS}>New Sale</Link>
          </Button>
        </div>
      </div>
      <SalesView initialRows={initialRows} initialPagination={firstPage.pagination} />
    </div>
  )
}
