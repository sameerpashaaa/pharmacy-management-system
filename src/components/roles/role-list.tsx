'use client'

// ─────────────────────────────────────────────────────────────
// Component — RoleList
// Shows all roles with permission counts and actions
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import { Edit, Trash2, Shield, Lock } from 'lucide-react'
import { useCallback } from 'react'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { useUiStore } from '@/lib/stores/ui-store'

// ─── Types ───────────────────────────────────────────────────

export type RoleRow = {
  id: string
  name: string
  displayName: string
  description?: string | null
  isSystem: boolean
  _count: { userRoles: number }
  rolePermissions: { permission: { id: string; code: string; name: string; module: string } }[]
}

interface RoleListProps {
  roles: RoleRow[]
  isLoading?: boolean
  onAddRole?: () => void
  onEditRole?: (role: RoleRow) => void
  onRefresh?: () => void
}

// ─── Columns ─────────────────────────────────────────────────

function useColumns(
  onEdit: (role: RoleRow) => void,
  onDelete: (role: RoleRow) => void
): ColumnDef<RoleRow>[] {
  return [
    {
      accessorKey: 'displayName',
      header: 'Role',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{row.original.displayName}</p>
            <p className="text-xs text-muted-foreground font-mono">{row.original.name}</p>
          </div>
          {row.original.isSystem && (
            <span title="System role">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.original.description ?? '—',
    },
    {
      accessorKey: 'rolePermissions',
      header: 'Permissions',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.rolePermissions.length} permissions</Badge>
      ),
    },
    {
      accessorKey: '_count',
      header: 'Users',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original._count.userRoles} users</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const role = row.original
        if (role.isSystem) return null
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(role)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(role)}
              disabled={role._count.userRoles > 0}
              title={role._count.userRoles > 0 ? 'Cannot delete — role has users' : 'Delete role'}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]
}

// ─── Component ───────────────────────────────────────────────

export function RoleList({
  roles,
  isLoading,
  onAddRole,
  onEditRole,
  onRefresh,
}: RoleListProps) {
  const { openConfirmDialog } = useUiStore()
  const toast = useToast()

  const handleDelete = useCallback(
    (role: RoleRow) => {
      openConfirmDialog({
        title: 'Delete Role',
        description: `Are you sure you want to delete the role "${role.displayName}"? This action cannot be undone.`,
        variant: 'destructive',
        onConfirm: async () => {
          const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
          if (res.ok) {
            toast.success('Role deleted')
            onRefresh?.()
          } else {
            toast.error('Failed to delete role')
          }
        },
      })
    },
    [openConfirmDialog, toast, onRefresh]
  )

  const columns = useColumns((role) => onEditRole?.(role), handleDelete)

  return (
    <DataTable
      columns={columns}
      data={roles}
      isLoading={isLoading}
      searchKey="displayName"
      searchPlaceholder="Search roles…"
      emptyMessage="No roles found."
      toolbar={
        onAddRole && (
          <Button size="sm" onClick={onAddRole}>
            <Shield className="mr-2 h-4 w-4" />
            Add Role
          </Button>
        )
      }
    />
  )
}
