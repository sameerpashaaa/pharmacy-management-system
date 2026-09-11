import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Add New User' }

export default function AddNewUserPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add New User</h1>
        <p className="text-muted-foreground">Create a new system user with role assignment</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 1 (Active)</p>
      </div>
    </div>
  )
}
