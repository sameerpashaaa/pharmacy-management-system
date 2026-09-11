import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Purchase Returns' }

export default function PurchaseReturnsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Returns</h1>
        <p className="text-muted-foreground">Track and manage purchase return requests</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 4</p>
      </div>
    </div>
  )
}
