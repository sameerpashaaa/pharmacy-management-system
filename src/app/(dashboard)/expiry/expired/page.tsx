import type { Metadata } from 'next'

import type { ExpiredBatchRow } from '@/components/expiry/expiry-table'
import { ExpiryView } from '@/components/expiry/expiry-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { getExpiredBatches } from '@/lib/batches/expiry-service'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Expired Batches' }

export default async function ExpiredBatchesPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.BATCHES_READ), getSession()])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expired Batches</h1>
          <p className="text-muted-foreground">Expired batches requiring disposal</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view batches.</p>
        </div>
      </div>
    )
  }

  const firstPage = await getExpiredBatches({
    page: 1,
    limit: 20,
    branchId: defaultBranchId ?? undefined,
  })

  const initialRows: ExpiredBatchRow[] = firstPage.data.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate.toISOString(),
    status: b.status,
    quantity: b.quantity,
    availableQuantity: b.availableQuantity,
    daysPast: b.daysPast,
    product: { id: b.product.id, name: b.product.name, sku: b.product.sku },
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expired Batches</h1>
        <p className="text-muted-foreground">
          EXPIRED batches blocked from dispensing and awaiting disposal.
        </p>
      </div>
      <ExpiryView
        mode="expired"
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
      />
    </div>
  )
}
