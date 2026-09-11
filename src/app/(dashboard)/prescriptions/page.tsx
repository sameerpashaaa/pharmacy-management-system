import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Prescription Management' }

export default function PrescriptionManagementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prescription Management</h1>
        <p className="text-muted-foreground">Manage customer prescriptions and dispensing records</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 3</p>
      </div>
    </div>
  )
}
