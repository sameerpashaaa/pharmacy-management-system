'use client'

// ─────────────────────────────────────────────────────────────
// Component — UsersView
// Owns user list state, fetches /api/users, exposes refresh +
// create/edit callbacks that route through dialogs in the parent.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'

import { UserTable, type UserRow } from '@/components/users/user-table'

export function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users?limit=100')
      const json = (await res.json()) as {
        success: boolean
        data: Array<
          Omit<UserRow, 'lastLoginAt' | 'createdAt'> & {
            lastLoginAt: string | null
            createdAt: string
          }
        >
      }
      if (json.success) {
        setUsers(
          json.data.map((u) => ({
            ...u,
            lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
            createdAt: new Date(u.createdAt),
          }))
        )
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers, refreshKey])

  return (
    <UserTable
      users={users}
      isLoading={isLoading}
      onAddUser={() => (window.location.href = '/users/new')}
      onEditUser={(u) => (window.location.href = `/users/${u.id}`)}
      onRefresh={() => setRefreshKey((k) => k + 1)}
    />
  )
}
