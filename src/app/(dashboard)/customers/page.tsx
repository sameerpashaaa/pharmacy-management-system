import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Customer Management' }

export default function CustomerManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Management</h1>
        <p className="text-muted-foreground">Manage customer database and credit accounts</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 5</p>
      </div>
    </div>
  )
}
