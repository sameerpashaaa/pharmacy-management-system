import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Organization Settings' }

export default function OrganizationSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">Business details, GSTIN, and branch configuration</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 1 (Active)</p>
      </div>
    </div>
  )
}
