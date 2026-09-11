import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Purchase Order' }

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Purchase Order</h1>
        <p className="text-muted-foreground">Create a new purchase order</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 4</p>
      </div>
    </div>
  )
}
