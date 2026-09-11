'use client'

// ─────────────────────────────────────────────────────────────
// Component — PermissionMatrix
// Grid of all permissions grouped by module, with checkboxes
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils/cn'

// ─── Types ───────────────────────────────────────────────────

type Permission = {
  id: string
  code: string
  name: string
  description?: string | null
  module: string
  action: string
}

interface PermissionMatrixProps {
  /** Currently granted permission IDs */
  grantedIds: string[]
  /** Called when user toggles a permission */
  onChange: (permissionIds: string[]) => void
  /** If true, the matrix is read-only */
  readOnly?: boolean
}

// ─── Component ───────────────────────────────────────────────

export function PermissionMatrix({ grantedIds, onChange, readOnly = false }: PermissionMatrixProps) {
  const toast = useToast()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/permissions')
      .then((r) => r.json())
      .then((d) => { if (d.success) setPermissions(d.data as Permission[]) })
      .catch(() => toast.error('Failed to load permissions'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingSpinner size="md" label="Loading permissions…" />

  // Group permissions by module
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = []
    acc[p.module].push(p)
    return acc
  }, {})

  function togglePermission(permId: string) {
    if (readOnly) return
    const next = grantedIds.includes(permId)
      ? grantedIds.filter((id) => id !== permId)
      : [...grantedIds, permId]
    onChange(next)
  }

  function toggleModule(modulePerms: Permission[]) {
    if (readOnly) return
    const allGranted = modulePerms.every((p) => grantedIds.includes(p.id))
    let next: string[]
    if (allGranted) {
      // Remove all in module
      next = grantedIds.filter((id) => !modulePerms.some((p) => p.id === id))
    } else {
      // Grant all in module
      const toAdd = modulePerms.map((p) => p.id).filter((id) => !grantedIds.includes(id))
      next = [...grantedIds, ...toAdd]
    }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([module, perms]) => {
        const allGranted = perms.every((p) => grantedIds.includes(p.id))
        const someGranted = perms.some((p) => grantedIds.includes(p.id))

        return (
          <div key={module} className="rounded-md border">
            {/* Module header */}
            <div
              className={cn(
                'flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5',
                !readOnly && 'cursor-pointer hover:bg-muted/70'
              )}
              onClick={() => toggleModule(perms)}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                  allGranted
                    ? 'border-primary bg-primary text-primary-foreground'
                    : someGranted
                    ? 'border-primary bg-primary/30'
                    : 'border-border bg-background'
                )}
              >
                {(allGranted || someGranted) && <Check className="h-3 w-3" />}
              </div>
              <span className="text-sm font-semibold capitalize">{module}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {perms.filter((p) => grantedIds.includes(p.id)).length} / {perms.length}
              </span>
            </div>

            {/* Permissions grid */}
            <div className="grid grid-cols-2 gap-1 p-3 md:grid-cols-3 lg:grid-cols-4">
              {perms.map((perm) => {
                const granted = grantedIds.includes(perm.id)
                return (
                  <button
                    key={perm.id}
                    type="button"
                    onClick={() => togglePermission(perm.id)}
                    disabled={readOnly}
                    title={perm.description ?? perm.code}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors text-left',
                      granted
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-transparent bg-muted/30 hover:bg-muted',
                      readOnly && 'cursor-default'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                        granted ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                      )}
                    >
                      {granted && <Check className="h-2.5 w-2.5" />}
                    </div>
                    {perm.name}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
