import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Audit & Compliance' }

export default function AuditCompliancePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
        <p className="text-muted-foreground">Complete audit trail of all system actions</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 9</p>
      </div>
    </div>
  )
}
