import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Purchase Returns' }

export default function PurchaseReturnsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Returns</h1>
        <p className="text-muted-foreground">Manage returns to suppliers and debit notes</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Purchase returns list — Phase 4 (API ready at /api/purchase-returns)</p>
      </div>
    </div>
  )
}