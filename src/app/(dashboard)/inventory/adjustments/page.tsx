import type { Metadata } from 'next'

import type { AdjustmentRow } from '@/components/inventory/adjustments-table'
import { AdjustmentsView } from '@/components/inventory/adjustments-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getAdjustments } from '@/lib/inventory/inventory-service'

export const metadata: Metadata = { title: 'Stock Adjustments' }

export default async function StockAdjustmentsPage() {
  const [canRead, canAdjust, canApprove, session] = await Promise.all([
    can(PERMISSIONS.INVENTORY_READ),
    can(PERMISSIONS.INVENTORY_ADJUST),
    can(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT),
    getSession(),
  ])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Adjustments</h1>
          <p className="text-muted-foreground">Adjust stock levels with reason tracking</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">
            You do not have permission to view stock adjustments.
          </p>
        </div>
      </div>
    )
  }

  const firstPage = await getAdjustments({
    page: 1,
    limit: 20,
    branchId: defaultBranchId ?? undefined,
  })

  const initialRows: AdjustmentRow[] = firstPage.data.map((a) => ({
    id: a.id,
    branchId: a.branchId,
    productId: a.productId,
    adjustmentType: a.adjustmentType,
    quantity: a.quantity,
    reason: a.reason,
    status: a.status,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    product: { id: a.product.id, name: a.product.name, sku: a.product.sku },
    branch: { id: a.branch.id, name: a.branch.name, code: a.branch.code },
    createdBy: a.createdBy,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Adjustments</h1>
        <p className="text-muted-foreground">Adjust stock levels with reason tracking</p>
      </div>
      <AdjustmentsView
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
        initialBranchId={defaultBranchId}
        canAdjust={canAdjust}
        canApprove={canApprove}
      />
    </div>
  )
}
