// ─────────────────────────────────────────────────────────────
// Inventory — Branch Access Control
// ─────────────────────────────────────────────────────────────
import type { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'

export interface AuthUser {
  id: string
  branchId: string | null
}

/**
 * Server-side branch authorization.
 *
 * A user's session carries `branchId`. A user is allowed to access branches
 * that belong to the SAME organization as their own branch. Users without a
 * branch assignment are treated as global (they can access any branch) —
 * this matches the existing single-organization model used across the app
 * (see org-service `getOrganization`). This is a documented limitation:
 * the session does not carry an `organizationId`, so organization isolation
 * depends on the requesting user having a branch assignment.
 *
 * Throws `Error('Forbidden: ...')` → 403, `Error('Not Found: branch')` → 404.
 */
export async function assertBranchAccess(user: AuthUser, branchId: string): Promise<void> {
  if (!user.branchId) return

  const [userBranch, targetBranch] = await Promise.all([
    prisma.branch.findUnique({ where: { id: user.branchId }, select: { organizationId: true } }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } }),
  ])

  if (!targetBranch) {
    throw new Error('Not Found: branch')
  }
  if (!userBranch || userBranch.organizationId !== targetBranch.organizationId) {
    throw new Error(`Forbidden: no access to branch '${branchId}'`)
  }
}

/**
 * Resolve the effective branch scope for a list request.
 *
 * - Explicit `requestedBranchId` → validated against the user, returned.
 * - No explicit branch and the user HAS a branch → defaults to the user's
 *   own branch (tightest secure default).
 * - No explicit branch and the user is branchless → null (all branches).
 */
export async function resolveBranchScope(
  user: AuthUser,
  requestedBranchId?: string
): Promise<string | null> {
  if (requestedBranchId) {
    await assertBranchAccess(user, requestedBranchId)
    return requestedBranchId
  }
  return user.branchId
}

/**
 * Branches the current user is allowed to see (for branch filters).
 * Users with a branch see all branches of their organization.
 */
export async function getAccessibleBranches(
  user: AuthUser
): Promise<{ id: string; name: string; code: string | null }[]> {
  const select = { id: true, name: true, code: true } as const
  const orderBy: Prisma.BranchOrderByWithRelationInput[] = [
    { isHeadOffice: 'desc' },
    { name: 'asc' },
  ]

  if (user.branchId) {
    const userBranch = await prisma.branch.findUnique({
      where: { id: user.branchId },
      select: { organizationId: true },
    })
    if (!userBranch) return []
    return prisma.branch.findMany({
      where: { organizationId: userBranch.organizationId, isActive: true },
      select,
      orderBy,
    })
  }

  return prisma.branch.findMany({
    where: { isActive: true },
    select,
    orderBy,
  })
}
