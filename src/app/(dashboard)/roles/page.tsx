import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Roles & Permissions' }

export default function RolesPermissionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
        <p className="text-muted-foreground">Manage user roles and permission assignments</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 1 (Active)</p>
      </div>
    </div>
  )
}
