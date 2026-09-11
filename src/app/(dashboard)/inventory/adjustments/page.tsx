import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Stock Adjustments' }

export default function StockAdjustmentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Adjustments</h1>
        <p className="text-muted-foreground">Adjust stock levels with reason tracking</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 2</p>
      </div>
    </div>
  )
}
