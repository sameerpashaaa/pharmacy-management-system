import type { Metadata } from 'next'

import type { ExpiringBatchRow } from '@/components/expiry/expiry-table'
import { ExpiryView } from '@/components/expiry/expiry-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { getExpiringBatches } from '@/lib/batches/expiry-service'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Expiring Batches' }

export default async function ExpiringBatchesPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.BATCHES_READ), getSession()])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expiring Batches</h1>
          <p className="text-muted-foreground">Batches expiring within the next 90 days</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view batches.</p>
        </div>
      </div>
    )
  }

  const firstPage = await getExpiringBatches({
    page: 1,
    limit: 20,
    branchId: defaultBranchId ?? undefined,
  })

  const initialRows: ExpiringBatchRow[] = firstPage.data.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate.toISOString(),
    availableQuantity: b.availableQuantity,
    daysRemaining: b.daysRemaining,
    severity: b.severity,
    product: { id: b.product.id, name: b.product.name, sku: b.product.sku },
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expiring Batches</h1>
        <p className="text-muted-foreground">
          Active batches expiring within 90 days — Critical (≤30), Warning (≤60), Info (≤90).
        </p>
      </div>
      <ExpiryView
        mode="expiring"
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
      />
    </div>
  )
}
