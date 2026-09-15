import type { Metadata } from 'next'

import {
  type PurchaseReturnRow,
} from '@/components/purchases/purchase-returns-table'
import { PurchaseReturnsView } from '@/components/purchases/purchase-returns-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listPurchaseReturns } from '@/lib/purchases/purchase-service'

export const metadata: Metadata = { title: 'Purchase Returns (RTV)' }

export default async function PurchaseReturnsPage() {
  const [canRead, canCreate, session] = await Promise.all([
    can(PERMISSIONS.PURCHASES_READ),
    can(PERMISSIONS.RETURNS_CREATE),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Returns (RTV)</h1>
          <p className="text-muted-foreground">Manage returns to suppliers and debit notes</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">
            You do not have permission to view purchase returns.
          </p>
        </div>
      </div>
    )
  }

  const result = await listPurchaseReturns({ limit: 100 }, session.user)

  const rows: PurchaseReturnRow[] = result.data.map((pr) => ({
    id: pr.id,
    returnNumber: pr.returnNumber,
    purchaseId: pr.purchase.id,
    purchaseNumber: pr.purchase.purchaseNumber,
    supplierId: pr.supplier.id,
    supplierName: pr.supplier.name,
    returnDate: pr.returnDate.toISOString(),
    reason: pr.reason,
    totalAmount: Number(pr.totalAmount),
    status: pr.status,
  }))

  const totalReturns = rows.length
  const totalDebitAmount = rows.reduce((sum, r) => sum + r.totalAmount, 0)
  const pendingReturnsCount = rows.filter((r) => r.status === 'PENDING').length

  return (
    <PurchaseReturnsView
      returns={rows}
      stats={{
        totalReturns,
        totalDebitAmount,
        pendingReturnsCount,
      }}
      canCreate={canCreate}
    />
  )
}