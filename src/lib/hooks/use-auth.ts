'use client'

// ─────────────────────────────────────────────────────────────
// Hook — useAuth
// ─────────────────────────────────────────────────────────────
import { useSession } from 'next-auth/react'

import { userCan } from '@/lib/auth/auth-helpers'
import type { PermissionCode } from '@/lib/constants/permissions'

export function useAuth() {
  const { data: session, status } = useSession()

  const user = session?.user ?? null
  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  /** Check if the current user has a specific permission */
  function can(permission: PermissionCode): boolean {
    if (!user) return false
    return userCan(user.permissions ?? [], permission)
  }

  /** Check if the user has any of the given permissions */
  function canAny(permissions: PermissionCode[]): boolean {
    if (!user) return false
    return permissions.some((p) => userCan(user.permissions ?? [], p))
  }

  /** Check if the user has all of the given permissions */
  function canAll(permissions: PermissionCode[]): boolean {
    if (!user) return false
    return permissions.every((p) => userCan(user.permissions ?? [], p))
  }

  return { user, session, isAuthenticated, isLoading, can, canAny, canAll }
}
