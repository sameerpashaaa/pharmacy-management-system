import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financial Management' }

export default function FinancialManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Management</h1>
        <p className="text-muted-foreground">Track receivables, payables, and financial health</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 6</p>
      </div>
    </div>
  )
}
