import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Expiring Batches' }

export default function ExpiringBatchesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expiring Batches</h1>
        <p className="text-muted-foreground">Batches expiring within 90 days</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 2</p>
      </div>
    </div>
  )
}
