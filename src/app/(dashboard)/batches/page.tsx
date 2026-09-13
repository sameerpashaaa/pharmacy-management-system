import type { Metadata } from 'next'

import type { BatchRow } from '@/components/batches/batches-table'
import { BatchesView } from '@/components/batches/batches-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { getBatches } from '@/lib/batches/batch-service'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Batch Management' }

export default async function BatchManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.BATCHES_READ), getSession()])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Management</h1>
          <p className="text-muted-foreground">Track product batches with expiry and FEFO logic</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view batches.</p>
        </div>
      </div>
    )
  }

  const firstPage = await getBatches({
    page: 1,
    limit: 20,
    branchId: defaultBranchId ?? undefined,
  })

  const initialRows: BatchRow[] = firstPage.data.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate.toISOString(),
    manufacturingDate: b.manufacturingDate ? b.manufacturingDate.toISOString() : null,
    status: b.status,
    quantity: b.quantity,
    availableQuantity: b.availableQuantity,
    purchasePrice: b.purchasePrice.toString(),
    mrp: b.mrp.toString(),
    product: { id: b.product.id, name: b.product.name, sku: b.product.sku },
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Batch Management</h1>
        <p className="text-muted-foreground">Track product batches with expiry and FEFO logic</p>
      </div>
      <BatchesView initialRows={initialRows} initialPagination={firstPage.pagination} />
    </div>
  )
}
