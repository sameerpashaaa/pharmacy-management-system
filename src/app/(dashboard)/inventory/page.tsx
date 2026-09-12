import type { Metadata } from 'next'

import { InventoryOverview } from '@/components/inventory/inventory-overview'
import type { InventoryRow } from '@/components/inventory/inventory-table'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getInventory } from '@/lib/inventory/inventory-service'

export const metadata: Metadata = { title: 'Inventory Management' }

export default async function InventoryManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.INVENTORY_READ), getSession()])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground">Real-time stock tracking across all products</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view inventory.</p>
        </div>
      </div>
    )
  }

  const firstPage = await getInventory({
    page: 1,
    limit: 20,
    branchId: defaultBranchId ?? undefined,
  })

  const initialRows: InventoryRow[] = firstPage.data.map((p) => ({
    id: p.id,
    productId: p.productId,
    branchId: p.branchId,
    totalQuantity: p.totalQuantity,
    reservedQuantity: p.reservedQuantity,
    availableQuantity: p.availableQuantity,
    updatedAt: p.updatedAt.toISOString(),
    stockStatus: p.stockStatus,
    product: {
      id: p.product.id,
      name: p.product.name,
      sku: p.product.sku,
      unitOfMeasure: p.product.unitOfMeasure,
      reorderLevel: p.product.reorderLevel,
      maxStockLevel: p.product.maxStockLevel,
    },
    branch: { id: p.branch.id, name: p.branch.name, code: p.branch.code },
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
        <p className="text-muted-foreground">Real-time stock tracking across all products</p>
      </div>
      <InventoryOverview
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
        initialBranchId={defaultBranchId}
      />
    </div>
  )
}
