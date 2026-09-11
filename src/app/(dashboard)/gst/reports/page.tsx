import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'GST Reports' }

export default function GSTReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GST Reports</h1>
        <p className="text-muted-foreground">GSTR-1 B2B, B2C, HSN summary reports</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 6</p>
      </div>
    </div>
  )
}
