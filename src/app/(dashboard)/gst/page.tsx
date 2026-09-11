import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'GST & Tax Management' }

export default function GSTTaxManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GST & Tax Management</h1>
        <p className="text-muted-foreground">GST compliance, reporting, and tax configuration</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 6</p>
      </div>
    </div>
  )
}
