'use client'

// ─────────────────────────────────────────────────────────────
// Component — RoleAssignment
// Assign / remove roles from a user inline
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useToast } from '@/lib/hooks/use-toast'

type Role = { id: string; name: string; displayName: string }

interface RoleAssignmentProps {
  userId: string
  currentRoleIds: string[]
  onUpdate?: (roleIds: string[]) => void
}

export function RoleAssignment({ userId, currentRoleIds, onUpdate }: RoleAssignmentProps) {
  const toast = useToast()
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [selected, setSelected] = useState<string[]>(currentRoleIds)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAllRoles(d.data as Role[]) })
      .catch(() => toast.error('Failed to load roles'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(roleId: string) {
    setSelected((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    )
  }

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: selected }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Roles updated')
      onUpdate?.(selected)
    } else {
      toast.error('Failed to update roles')
    }
  }

  const isDirty =
    selected.length !== currentRoleIds.length ||
    selected.some((id) => !currentRoleIds.includes(id))

  if (loading) return <LoadingSpinner size="sm" />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allRoles.map((role) => {
          const isSelected = selected.includes(role.id)
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => toggle(role.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent hover:bg-muted'
              }`}
            >
              {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {role.displayName}
            </button>
          )
        })}
      </div>
      {isDirty && (
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(currentRoleIds)}
            disabled={saving}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
