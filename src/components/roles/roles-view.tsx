'use client'

// ─────────────────────────────────────────────────────────────
// Component — RolesView
// Fetches /api/roles, hands data to RoleList. Edit/add navigate
// to dedicated /roles/new and /roles/[id] pages; delete uses
// RoleList's confirm dialog.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'

import { RoleList, type RoleRow } from '@/components/roles/role-list'

export function RolesView() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchRoles = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/roles')
      const json = (await res.json()) as { success: boolean; data: RoleRow[] }
      if (json.success) setRoles(json.data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRoles()
  }, [fetchRoles, refreshKey])

  return (
    <RoleList
      roles={roles}
      isLoading={isLoading}
      onAddRole={() => (window.location.href = '/roles/new')}
      onEditRole={(r) => (window.location.href = `/roles/${r.id}`)}
      onRefresh={() => setRefreshKey((k) => k + 1)}
    />
  )
}
