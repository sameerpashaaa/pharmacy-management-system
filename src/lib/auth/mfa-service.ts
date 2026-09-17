import bcrypt from 'bcryptjs'

import prisma from '@/lib/db/prisma'

import { createMfaPendingToken, verifyMfaPendingToken, verifyToken } from './mfa'
import { decryptSecret } from './mfa-crypto'

export interface AuthenticatedUserPayload {
  id: string
  name: string | null
  email: string
  image: string | null
  permissions: string[]
  roles: string[]
  branchId: string | null
  mfaVerified: boolean
}

type PasswordStepResult =
  | { status: 'authenticated'; user: AuthenticatedUserPayload }
  | { status: 'mfa_required'; mfaToken: string; userId: string }

function toPayload(args: {
  id: string
  name: string | null
  email: string
  image: string | null
  permissions: string[]
  roles: string[]
  branchId: string | null
  mfaVerified: boolean
}): AuthenticatedUserPayload {
  return args
}

async function recordFailedLogin(userId: string, failedCount: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: { increment: 1 },
      lockedUntil: failedCount >= 4 ? new Date(Date.now() + 15 * 60 * 1000) : undefined,
    },
  })
}

async function resetLoginState(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  })
}

async function loadUserWithRoles(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  })
}

function buildPayload(
  user: NonNullable<Awaited<ReturnType<typeof loadUserWithRoles>>>,
  mfaVerified: boolean
): AuthenticatedUserPayload {
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))
    ),
  ]
  const roles = user.userRoles.map((ur) => ur.role.name)
  return toPayload({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    permissions,
    roles,
    branchId: user.branchId,
    mfaVerified,
  })
}

/**
 * Step 1 of login: verifies credentials (with the existing lockout behavior).
 * Owner accounts with MFA enabled do NOT receive a session payload here —
 * they receive a short-lived MFA-pending credential instead.
 */
export async function verifyPasswordStep(
  email: string,
  password: string
): Promise<PasswordStepResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  })

  if (!user) throw new Error('Invalid email or password')
  if (!user.isActive) throw new Error('Your account has been deactivated')
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error('Account temporarily locked due to too many failed attempts')
  }
  if (!user.password) throw new Error('Please use the password reset flow to set a password')

  const isValidPassword = await bcrypt.compare(password, user.password)
  if (!isValidPassword) {
    await recordFailedLogin(user.id, user.failedLoginCount)
    throw new Error('Invalid email or password')
  }

  const roles = user.userRoles.map((ur) => ur.role.name)
  const isOwner = roles.includes('owner')

  if (isOwner && user.mfaEnabled) {
    const mfaToken = await createMfaPendingToken(user.id)
    return { status: 'mfa_required', mfaToken, userId: user.id }
  }

  await resetLoginState(user.id)
  return { status: 'authenticated', user: buildPayload(user, false) }
}

/**
 * Step 2 of login: completes the MFA challenge. Only a valid pending
 * credential plus a correct TOTP code yields an authenticated payload.
 * No permissions are issued before successful TOTP verification.
 */
export async function completeMfaChallenge(
  mfaToken: string,
  totpCode: string
): Promise<AuthenticatedUserPayload> {
  if (!mfaToken || !totpCode) throw new Error('MFA token and code are required')

  const userId = await verifyMfaPendingToken(mfaToken)
  if (!userId) throw new Error('Invalid or expired MFA session')

  const user = await loadUserWithRoles(userId)
  if (!user || !user.isActive) throw new Error('Invalid or expired MFA session')
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error('Account temporarily locked due to too many failed attempts')
  }
  const roles = user.userRoles.map((ur) => ur.role.name)
  if (!roles.includes('owner') || !user.mfaEnabled || !user.totpSecret) {
    throw new Error('Invalid or expired MFA session')
  }

  let secret: string
  try {
    secret = decryptSecret(user.totpSecret)
  } catch {
    throw new Error('Invalid or expired MFA session')
  }

  const valid = verifyToken(totpCode.trim(), secret)
  if (!valid) {
    await recordFailedLogin(user.id, user.failedLoginCount)
    throw new Error('Invalid authentication code')
  }

  await resetLoginState(user.id)
  return buildPayload(user, true)
}
