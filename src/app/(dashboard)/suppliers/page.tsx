import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Supplier Management' }

export default function SupplierManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supplier Management</h1>
        <p className="text-muted-foreground">Manage supplier database and payable tracking</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 4</p>
      </div>
    </div>
  )
}
