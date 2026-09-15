import type { Metadata } from 'next'
import Link from 'next/link'

import type { PurchaseRow } from '@/components/purchases/purchases-table'
import { PurchasesView } from '@/components/purchases/purchases-view'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { listPurchases } from '@/lib/purchases/purchase-service'
import { purchaseListQuerySchema } from '@/lib/validations/purchase'


export const metadata: Metadata = { title: 'Purchase Orders' }

export default async function PurchaseOrdersPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.PURCHASES_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage purchase orders and goods receipts</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view purchase orders.</p>
        </div>
      </div>
    )
  }

  const defaultQuery = purchaseListQuerySchema.parse({ page: 1, limit: 20 })
  const firstPage = await listPurchases(defaultQuery, session.user)

  const initialRows: PurchaseRow[] = firstPage.data.map((p) => ({
    id: p.id,
    purchaseNumber: p.purchaseNumber,
    purchaseDate: p.purchaseDate.toISOString(),
    status: p.status as PurchaseRow['status'],
    totalAmount: p.totalAmount.toString(),
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
    createdBy: p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name } : null,
  }))


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage purchase orders and goods receipts</p>
        </div>
        <Button asChild>
          <Link href={ROUTES.PURCHASES_NEW}>New Purchase Order</Link>
        </Button>
      </div>
      <PurchasesView initialRows={initialRows} initialPagination={firstPage.pagination} />
    </div>
  )
}