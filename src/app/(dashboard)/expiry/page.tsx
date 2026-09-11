import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Expiry Management' }

export default function ExpiryManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expiry Management</h1>
        <p className="text-muted-foreground">Proactive expiry tracking, alerts, and disposal management</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 7</p>
      </div>
    </div>
  )
}
