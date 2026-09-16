import { getServerSession } from 'next-auth'

import type { PermissionCode } from '@/lib/constants/permissions'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

import { authOptions } from './auth-config'

/**
 * Get the current session on the server side (in API routes / Server Components)
 *
 * Re-validates that the account is still active so that deactivated users
 * cannot keep using an already-issued JWT until it expires.
 */
export async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isActive: true },
  })
  if (!user || !user.isActive) return null

  return session
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

/**
 * Guard role assignment against privilege escalation.
 *
 * Only an actor holding roles:manage may assign arbitrary roles
 * (including owner/manager). All other actors may only assign roles
 * whose full permission set is a subset of their own permissions,
 * preventing self- or cross-escalation via the users APIs.
 */
export async function assertAssignableRoles(roleIds: string[]): Promise<void> {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  const actorCanManageRoles = session.user.permissions.includes(PERMISSIONS.ROLES_MANAGE)
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: {
      id: true,
      name: true,
      rolePermissions: { select: { permission: { select: { code: true } } } },
    },
  })

  const found = new Set(roles.map((r) => r.id))
  const missing = roleIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new Error(`Forbidden: one or more roles do not exist`)
  }

  if (actorCanManageRoles) return

  const actorPermissions = new Set(session.user.permissions)
  for (const role of roles) {
    const rolePermissions = role.rolePermissions.map((rp) => rp.permission.code)
    const escalates = rolePermissions.some((code) => !actorPermissions.has(code))
    if (escalates) {
      throw new Error(
        `Forbidden: role '${role.name}' grants permissions you do not hold and cannot be assigned`
      )
    }
  }
}
