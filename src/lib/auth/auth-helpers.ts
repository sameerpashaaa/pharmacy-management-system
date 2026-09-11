import { getServerSession } from 'next-auth'

import { authOptions } from './auth-config'
import type { PermissionCode } from '@/lib/constants/permissions'

/**
 * Get the current session on the server side (in API routes / Server Components)
 */
export async function getSession() {
  return getServerSession(authOptions)
}

/**
 * Get the current user, throws if not authenticated
 */
export async function requireAuth() {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session.user
}

/**
 * Check if the current user has a specific permission
 */
export async function can(permission: PermissionCode): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  return session.user.permissions.includes(permission)
}

/**
 * Require a specific permission, throws 403 if not allowed
 */
export async function requirePermission(permission: PermissionCode) {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  if (!session.user.permissions.includes(permission)) {
    throw new Error(`Forbidden: requires permission '${permission}'`)
  }
  return session.user
}

/**
 * Check if user has any of the given permissions
 */
export async function canAny(permissions: PermissionCode[]): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  return permissions.some((p) => session.user.permissions.includes(p))
}

/**
 * Client-side permission check from a session user object
 */
export function userCan(
  permissions: string[],
  permission: PermissionCode
): boolean {
  return permissions.includes(permission)
}
