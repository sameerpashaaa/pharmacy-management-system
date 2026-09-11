import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Inventory Reports' }

export default function InventoryReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory Reports</h1>
        <p className="text-muted-foreground">Stock valuation, movement analysis, and dead stock</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 7</p>
      </div>
    </div>
  )
}
