import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Purchase Management' }

export default function PurchaseManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase Management</h1>
        <p className="text-muted-foreground">Manage purchase orders and goods receipts</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 4</p>
      </div>
    </div>
  )
}
