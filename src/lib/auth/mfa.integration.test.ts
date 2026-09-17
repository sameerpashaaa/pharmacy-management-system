/**
 * @jest-environment node
 */
// TOTP MFA + password history — Real Postgres.
//
// Runs against the dedicated test database when DATABASE_URL is set.
// The suite skips itself when no DB is configured.
import bcrypt from 'bcryptjs'
import { encode, type JWT } from 'next-auth/jwt'

import { authOptions } from '@/lib/auth/auth-config'
import { requireAuth, requirePermission } from '@/lib/auth/auth-helpers'
import { decryptSecret } from '@/lib/auth/mfa-crypto'
import { completeMfaChallenge, verifyPasswordStep } from '@/lib/auth/mfa-service'
import {
  isPasswordReused,
  PASSWORD_HISTORY_LIMIT,
  recordPasswordHistory,
} from '@/lib/auth/password-history'
import { totp } from '@/lib/auth/totp'
import prisma from '@/lib/db/prisma'

const HAS_DB = Boolean(process.env.DATABASE_URL)

jest.mock('@/lib/auth/auth-helpers', () => ({
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}))

// @auth/prisma-adapter ships ESM which jest does not transform; it is unused
// by the credentials authorize() path under test.
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => undefined),
}))

const mockedRequireAuth = requireAuth as jest.Mock
const mockedRequirePermission = requirePermission as jest.Mock

const TEST_MFA_KEY = '0123456789abcdef0123456789abcdef'
const TEST_JWT_SECRET = 'test-nextauth-secret-value-1234'
const OLD_MFA_KEY = process.env.MFA_ENCRYPTION_KEY
const OLD_JWT_SECRET = process.env.NEXTAUTH_SECRET

const TBLS = [
  'audit_logs',
  'password_histories',
  'password_reset_tokens',
  'user_roles',
  'role_permissions',
  'permissions',
  'roles',
  'users',
  'branches',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

interface Fx {
  ownerId: string
  managerId: string
  ownerEmail: string
  managerEmail: string
  ownerPassword: string
  branchId: string
}

async function seedFx(): Promise<Fx> {
  const ownerPassword = 'Owner123!x'
  const managerPassword = 'Manager123!x'
  const org = await prisma.organization.create({ data: { name: 'MFA Org' } })
  const branch = await prisma.branch.create({
    data: { organizationId: org.id, name: 'MFA Branch', code: 'MFA', invoicePrefix: 'INV' },
  })
  const perm = await prisma.permission.create({
    data: { code: 'users:create', name: 'Create Users', module: 'users', action: 'create' },
  })
  const ownerRole = await prisma.role.create({
    data: { name: 'owner', displayName: 'Owner', isSystem: true },
  })
  const managerRole = await prisma.role.create({
    data: { name: 'manager', displayName: 'Manager', isSystem: true },
  })
  await prisma.rolePermission.create({
    data: { roleId: ownerRole.id, permissionId: perm.id },
  })
  const owner = await prisma.user.create({
    data: {
      name: 'Owner',
      email: 'owner@mfa.test',
      password: await bcrypt.hash(ownerPassword, 12),
      isActive: true,
      branchId: branch.id,
    },
  })
  const manager = await prisma.user.create({
    data: {
      name: 'Manager',
      email: 'manager@mfa.test',
      password: await bcrypt.hash(managerPassword, 12),
      isActive: true,
      branchId: branch.id,
    },
  })
  await prisma.userRole.create({ data: { userId: owner.id, roleId: ownerRole.id } })
  await prisma.userRole.create({ data: { userId: manager.id, roleId: managerRole.id } })
  return {
    ownerId: owner.id,
    managerId: manager.id,
    ownerEmail: owner.email,
    managerEmail: manager.email,
    ownerPassword,
    branchId: branch.id,
  }
}

function authorize(credentials: Record<string, string>) {
  // Invoke the exact authorize() implementation from auth-config.ts. It lives
  // under provider.options in the installed next-auth build; the top-level
  // provider.authorize stub is not ours.
  const provider = authOptions.providers[0] as unknown as {
    options: { authorize: (c: Record<string, string>) => Promise<unknown> }
  }
  return provider.options.authorize(credentials)
}

function invalidCodeFor(secret: string): string {
  const valid = totp(secret)
  for (const candidate of ['000000', '111111', '123456', '999999']) {
    if (candidate !== valid) return candidate
  }
  return '000001'
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('TOTP MFA + password history (real Postgres)', () => {
  let fx: Fx

  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY
    process.env.NEXTAUTH_SECRET = TEST_JWT_SECRET
  })

  afterAll(() => {
    if (OLD_MFA_KEY === undefined) delete process.env.MFA_ENCRYPTION_KEY
    else process.env.MFA_ENCRYPTION_KEY = OLD_MFA_KEY
    if (OLD_JWT_SECRET === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = OLD_JWT_SECRET
    return prisma.$disconnect()
  })

  beforeEach(async () => {
    await resetDb()
    fx = await seedFx()
    jest.clearAllMocks()
  })

  // ── Password history helper ──────────────────────────────────

  // Explicit timeout: ~10 sequential bcrypt cost-12 operations exceed the
  // default 5s budget on slower CI runners. Cost is intentionally unchanged.
  it('detects reuse against the last 5 hashes and retains only 5', async () => {
    const weak = 'Legacy123'
    const hash = await bcrypt.hash(weak, 12)
    await prisma.user.update({ where: { id: fx.ownerId }, data: { password: hash } })
    await prisma.$transaction(async (tx) => {
      await recordPasswordHistory(tx, fx.ownerId, hash)
    })
    expect(await isPasswordReused(fx.ownerId, weak)).toBe(true)
    expect(await isPasswordReused(fx.ownerId, 'SomethingElse123!')).toBe(false)

    for (let i = 0; i < 7; i++) {
      const h = await bcrypt.hash(`Password${i}123!`, 12)
      await prisma.$transaction(async (tx) => {
        await recordPasswordHistory(tx, fx.ownerId, h)
      })
    }
    const count = await prisma.passwordHistory.count({ where: { userId: fx.ownerId } })
    expect(count).toBe(PASSWORD_HISTORY_LIMIT)
    // The oldest entries were pruned: the very first password is reusable again
    expect(await isPasswordReused(fx.ownerId, weak)).toBe(false)
    expect(await isPasswordReused(fx.ownerId, 'Password6123!')).toBe(true)
  }, 30000)

  // ── Password policy on user routes ───────────────────────────

  it('POST /api/users rejects weak passwords and records history on success', async () => {
    mockedRequirePermission.mockResolvedValue({ id: fx.ownerId })
    const { POST } = await import('@/app/api/users/route')

    const weak = await POST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Weak',
          email: 'weak@mfa.test',
          password: 'short',
          roleIds: ['x'],
        }),
      }) as unknown as Parameters<typeof POST>[0]
    )
    expect(weak.status).toBe(400)

    const role = await prisma.role.findUnique({ where: { name: 'manager' } })
    const strong = await POST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Strong',
          email: 'strong@mfa.test',
          password: 'StrongPass123!',
          roleIds: [role!.id],
        }),
      }) as unknown as Parameters<typeof POST>[0]
    )
    expect(strong.status).toBe(201)
    const created = await prisma.user.findUnique({ where: { email: 'strong@mfa.test' } })
    expect(created).not.toBeNull()
    const history = await prisma.passwordHistory.findMany({ where: { userId: created!.id } })
    expect(history).toHaveLength(1)
  })

  it('PUT /api/users/[id] rejects reused passwords', async () => {
    mockedRequirePermission.mockResolvedValue({ id: fx.ownerId })
    const { PUT } = await import('@/app/api/users/[id]/route')
    const params = { params: { id: fx.managerId } }

    const first = await PUT(
      new Request('http://localhost/api/users/x', {
        method: 'PUT',
        body: JSON.stringify({ password: 'BrandNew123!' }),
      }) as unknown as Parameters<typeof PUT>[0],
      params
    )
    expect(first.status).toBe(200)

    const reuseNew = await PUT(
      new Request('http://localhost/api/users/x', {
        method: 'PUT',
        body: JSON.stringify({ password: 'BrandNew123!' }),
      }) as unknown as Parameters<typeof PUT>[0],
      params
    )
    expect(reuseNew.status).toBe(400)
    const body = (await reuseNew.json()) as { error: { message: string } }
    expect(body.error.message).toMatch(/last 5/i)
  })

  it('legacy weak passwords still authenticate (no retroactive lockout)', async () => {
    const weak = 'weak'
    await prisma.user.update({
      where: { id: fx.managerId },
      data: { password: await bcrypt.hash(weak, 12) },
    })
    const result = (await authorize({ email: fx.managerEmail, password: weak })) as {
      id: string
      permissions: string[]
    }
    expect(result.id).toBe(fx.managerId)
  })

  // ── MFA enrollment ───────────────────────────────────────────

  it('setup stores an encrypted secret, hides the raw secret, stays disabled', async () => {
    mockedRequireAuth.mockResolvedValue({ id: fx.ownerId, roles: ['owner'] })
    const { POST } = await import('@/app/api/auth/mfa/setup/route')
    const res = await POST()
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      success: boolean
      data: { otpauthUrl: string; qrDataUrl: string; secret?: string }
    }
    expect(body.success).toBe(true)
    expect(body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//)
    expect(body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(body.data.secret).toBeUndefined()

    const row = await prisma.user.findUnique({ where: { id: fx.ownerId } })
    expect(row!.mfaEnabled).toBe(false)
    expect(row!.totpSecret).not.toBeNull()
    expect(row!.totpSecret).not.toContain('otpauth')
    // Encrypted at rest: decrypts to a usable TOTP secret
    const secret = decryptSecret(row!.totpSecret!)
    expect(totp(secret)).toMatch(/^\d{6}$/)
  })

  it('setup rejects non-owners', async () => {
    mockedRequireAuth.mockResolvedValue({ id: fx.managerId, roles: ['manager'] })
    const { POST } = await import('@/app/api/auth/mfa/setup/route')
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('verify enables MFA only with a valid code', async () => {
    mockedRequireAuth.mockResolvedValue({ id: fx.ownerId, roles: ['owner'] })
    const { POST: setup } = await import('@/app/api/auth/mfa/setup/route')
    const { POST: verify } = await import('@/app/api/auth/mfa/verify/route')
    await setup()

    const row = await prisma.user.findUnique({ where: { id: fx.ownerId } })
    const secret = decryptSecret(row!.totpSecret!)

    const bad = await verify(
      new Request('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: invalidCodeFor(secret) }),
      }) as unknown as Parameters<typeof verify>[0]
    )
    expect(bad.status).toBe(401)
    expect((await prisma.user.findUnique({ where: { id: fx.ownerId } }))!.mfaEnabled).toBe(false)

    const good = await verify(
      new Request('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: totp(secret) }),
      }) as unknown as Parameters<typeof verify>[0]
    )
    expect(good.status).toBe(200)
    expect((await prisma.user.findUnique({ where: { id: fx.ownerId } }))!.mfaEnabled).toBe(true)
  })

  // ── MFA authentication boundary ──────────────────────────────

  it('owner without MFA authenticates normally', async () => {
    const step = await verifyPasswordStep(fx.ownerEmail, fx.ownerPassword)
    expect(step.status).toBe('authenticated')
    if (step.status === 'authenticated') {
      expect(step.user.id).toBe(fx.ownerId)
      expect(step.user.permissions).toContain('users:create')
    }
  })

  it('password-verified owner with MFA gets NO session payload, only a pending credential', async () => {
    await prisma.user.update({
      where: { id: fx.ownerId },
      data: { mfaEnabled: true, totpSecret: 'x' },
    })
    const step = await verifyPasswordStep(fx.ownerEmail, fx.ownerPassword)
    expect(step.status).toBe('mfa_required')
    if (step.status !== 'mfa_required') throw new Error('expected mfa_required')
    expect(step).not.toHaveProperty('permissions')
    expect(step).not.toHaveProperty('roles')
    expect(typeof step.mfaToken).toBe('string')

    // The pending credential carries no application permissions
    const { decode } = await import('next-auth/jwt')
    const decoded = (await decode({ token: step.mfaToken, secret: TEST_JWT_SECRET })) as Record<
      string,
      unknown
    > | null
    expect(decoded).not.toBeNull()
    expect(decoded!.mfaPending).toBe(true)
    expect(decoded).not.toHaveProperty('permissions')
    expect(decoded).not.toHaveProperty('roles')
  })

  it('authorize() throws MFA_REQUIRED (no user) and completes only with valid TOTP', async () => {
    const { generateSecret } = await import('@/lib/auth/mfa')
    const { encryptSecret } = await import('@/lib/auth/mfa-crypto')
    const secret = generateSecret()
    await prisma.user.update({
      where: { id: fx.ownerId },
      data: { mfaEnabled: true, totpSecret: encryptSecret(secret) },
    })

    // Password-only branch: throws, returns no user → NextAuth issues no session
    const err = await authorize({ email: fx.ownerEmail, password: fx.ownerPassword }).catch(
      (e: Error) => e
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message.startsWith('MFA_REQUIRED:')).toBe(true)
    const mfaToken = (err as Error).message.slice('MFA_REQUIRED:'.length)

    // Wrong code: still unauthenticated
    await expect(authorize({ mfaToken, totpCode: invalidCodeFor(secret) })).rejects.toThrow(
      'Invalid authentication code'
    )

    // Correct code: full user payload (what jwt/session callbacks turn into a session)
    const user = (await authorize({ mfaToken, totpCode: totp(secret) })) as {
      id: string
      permissions: string[]
      roles: string[]
      mfaVerified: boolean
    }
    expect(user.id).toBe(fx.ownerId)
    expect(user.permissions).toContain('users:create')
    expect(user.roles).toContain('owner')
    expect(user.mfaVerified).toBe(true)
  })

  it('expired or forged pending credentials fail', async () => {
    const forged = await encode({
      token: { sub: fx.ownerId, mfaPending: true } as unknown as JWT,
      secret: TEST_JWT_SECRET,
      maxAge: -10,
    })
    await expect(completeMfaChallenge(forged, '123456')).rejects.toThrow(
      'Invalid or expired MFA session'
    )
    await expect(completeMfaChallenge('not-a-token', '123456')).rejects.toThrow(
      'Invalid or expired MFA session'
    )
  })

  it('non-owner login behavior is unchanged (no MFA gate)', async () => {
    const step = await verifyPasswordStep(fx.managerEmail, 'Manager123!x')
    expect(step.status).toBe('authenticated')
  })

  it('lockout still triggers after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await authorize({ email: fx.managerEmail, password: 'WrongPass123!' }).catch(() => undefined)
    }
    await expect(authorize({ email: fx.managerEmail, password: 'Manager123!x' })).rejects.toThrow(
      'locked'
    )
  })
})
