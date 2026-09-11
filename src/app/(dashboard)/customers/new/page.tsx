import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Add New Customer' }

export default function AddNewCustomerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New Customer</h1>
        <p className="text-muted-foreground">Add a new customer to the system</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 5</p>
      </div>
    </div>
  )
}
