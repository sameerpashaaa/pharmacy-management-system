'use client'

// ─────────────────────────────────────────────────────────────
// Component — UserTable
// Displays paginated users list with actions
// ─────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, UserPlus, Edit, Trash2, UserCheck, UserX } from 'lucide-react'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/lib/stores/ui-store'
import { useToast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type UserRow = {
  id: string
  name: string
  email: string
  phone?: string | null
  isActive: boolean
  lastLoginAt?: Date | null
  createdAt: Date
  userRoles: { role: { id: string; name: string; displayName: string } }[]
}

interface UserTableProps {
  users: UserRow[]
  isLoading?: boolean
  onAddUser?: () => void
  onEditUser?: (user: UserRow) => void
  onRefresh?: () => void
}

// ─── Columns ─────────────────────────────────────────────────

function useColumns(
  onEdit: (user: UserRow) => void,
  onToggleActive: (user: UserRow) => void,
  onDelete: (user: UserRow) => void
): ColumnDef<UserRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'userRoles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.userRoles.map((ur) => (
            <Badge key={ur.role.id} variant="secondary" className="text-xs">
              {ur.role.displayName}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone ?? '—',
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'destructive'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last Login',
      cell: ({ row }) =>
        row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : 'Never',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(user)}
              title="Edit user"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggleActive(user)}
              title={user.isActive ? 'Deactivate user' : 'Activate user'}
            >
              {user.isActive ? (
                <UserX className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <UserCheck className="h-3.5 w-3.5 text-green-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(user)}
              title="Delete user"
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

export function UserTable({
  users,
  isLoading,
  onAddUser,
  onEditUser,
  onRefresh,
}: UserTableProps) {
  const { openConfirmDialog } = useUiStore()
  const toast = useToast()

  const handleToggleActive = useCallback(
    (user: UserRow) => {
      const action = user.isActive ? 'deactivate' : 'activate'
      openConfirmDialog({
        title: `${user.isActive ? 'Deactivate' : 'Activate'} User`,
        description: `Are you sure you want to ${action} "${user.name}"?`,
        variant: user.isActive ? 'destructive' : 'default',
        onConfirm: async () => {
          const res = await fetch(`/api/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !user.isActive }),
          })
          if (res.ok) {
            toast.success(`User ${action}d successfully`)
            onRefresh?.()
          } else {
            toast.error(`Failed to ${action} user`)
          }
        },
      })
    },
    [openConfirmDialog, toast, onRefresh]
  )

  const handleDelete = useCallback(
    (user: UserRow) => {
      openConfirmDialog({
        title: 'Delete User',
        description: `This will permanently delete "${user.name}". This action cannot be undone.`,
        variant: 'destructive',
        onConfirm: async () => {
          const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
          if (res.ok) {
            toast.success('User deleted successfully')
            onRefresh?.()
          } else {
            toast.error('Failed to delete user')
          }
        },
      })
    },
    [openConfirmDialog, toast, onRefresh]
  )

  const columns = useColumns(
    (user) => onEditUser?.(user),
    handleToggleActive,
    handleDelete
  )

  return (
    <DataTable
      columns={columns}
      data={users}
      isLoading={isLoading}
      searchKey="name"
      searchPlaceholder="Search users…"
      emptyMessage="No users found. Add your first user to get started."
      toolbar={
        onAddUser && (
          <Button size="sm" onClick={onAddUser}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        )
      }
    />
  )
}
