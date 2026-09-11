import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Expired Batches' }

export default function ExpiredBatchesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expired Batches</h1>
        <p className="text-muted-foreground">Expired batches requiring disposal</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 7</p>
      </div>
    </div>
  )
}
