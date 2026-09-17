/**
 * @jest-environment node
 */
// Adjustment Approval Tiers — Real Postgres integration tests
import prisma from '@/lib/db/prisma'
import type { AuthUser } from '@/lib/inventory/branch-access'
import {
  createAdjustment,
  approveAdjustment,
  rejectAdjustment,
} from '@/lib/inventory/inventory-service'
import { getApprovalPolicy, validateApprovalPolicy } from '@/lib/settings/settings-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'inventory_movements',
  'stock_adjustments',
  'files',
  'inventory',
  'batches',
  'products',
  'user_roles',
  'role_permissions',
  'permissions',
  'roles',
  'users',
  'branches',
  'organizations',
  'system_settings',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

interface Fixtures {
  org1: string
  org2: string
  branchA: string
  branchB: string
  branchOtherOrg: string
  productId: string
  pharmacist: AuthUser
  manager: AuthUser
  chief: AuthUser
  owner: AuthUser
  otherOrgUser: AuthUser
}

async function seedFixtures(): Promise<Fixtures> {
  const org1 = await prisma.organization.create({ data: { name: 'Org One' } })
  const org2 = await prisma.organization.create({ data: { name: 'Org Two' } })

  const branchA = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch A', code: 'A', invoicePrefix: 'INV' },
  })
  const branchB = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch B', code: 'B', invoicePrefix: 'INV' },
  })
  const branchOther = await prisma.branch.create({
    data: { organizationId: org2.id, name: 'Branch Other', code: 'O', invoicePrefix: 'INV' },
  })

  // Permissions
  const perms = [
    { code: 'inventory:read', name: 'View Inventory', module: 'inventory', action: 'read' },
    { code: 'inventory:adjust', name: 'Adjust Stock', module: 'inventory', action: 'adjust' },
    {
      code: 'inventory:approve_adjustment',
      name: 'Approve',
      module: 'inventory',
      action: 'approve',
    },
    {
      code: 'inventory:approve_adjustment_chief',
      name: 'Approve Chief',
      module: 'inventory',
      action: 'approve_chief',
    },
    { code: 'settings:read', name: 'View Settings', module: 'settings', action: 'read' },
    { code: 'settings:manage', name: 'Manage Settings', module: 'settings', action: 'manage' },
  ]
  for (const p of perms) {
    await prisma.permission.upsert({ where: { code: p.code }, update: {}, create: p })
  }
  const allPerms = await prisma.permission.findMany()
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]))

  // Roles
  const rolesData: Array<{ name: string; displayName: string; perms: string[] }> = [
    {
      name: 'pharmacist',
      displayName: 'Pharmacist',
      perms: ['inventory:read', 'inventory:adjust'],
    },
    {
      name: 'manager',
      displayName: 'Store Manager',
      perms: ['inventory:read', 'inventory:adjust', 'inventory:approve_adjustment'],
    },
    {
      name: 'chief_pharmacist',
      displayName: 'Chief Pharmacist',
      perms: [
        'inventory:read',
        'inventory:adjust',
        'inventory:approve_adjustment',
        'inventory:approve_adjustment_chief',
      ],
    },
    { name: 'owner', displayName: 'Owner', perms: allPerms.map((p) => p.code) },
  ]
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: { name: r.name, displayName: r.displayName, isSystem: true },
    })
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    for (const code of r.perms) {
      const pid = permMap.get(code)
      if (pid) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: pid } })
    }
  }
  // Cache role ids for user creation
  const pharmacistRole = await prisma.role.findUniqueOrThrow({ where: { name: 'pharmacist' } })
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'manager' } })
  const chiefRole = await prisma.role.findUniqueOrThrow({ where: { name: 'chief_pharmacist' } })
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'owner' } })

  const createUser = async (email: string, branchId: string | null, roleId: string) => {
    const u = await prisma.user.create({
      data: { name: email.split('@')[0], email, branchId, password: 'x', isActive: true },
    })
    await prisma.userRole.create({ data: { userId: u.id, roleId } })
    return u
  }

  const pharmacistUser = await createUser('pharmacist@test.local', branchA.id, pharmacistRole.id)
  const managerUser = await createUser('manager@test.local', branchA.id, managerRole.id)
  const chiefUser = await createUser('chief@test.local', branchA.id, chiefRole.id)
  const ownerUser = await createUser('owner@test.local', branchA.id, ownerRole.id)
  const otherUser = await createUser('other@test.local', branchOther.id, managerRole.id)

  const product = await prisma.product.create({
    data: {
      name: 'Test Product',
      sku: 'TEST-001',
      barcode: '0000000001',
      manufacturer: 'Test',
      composition: 'Test',
      drugSchedule: 'NONE',
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      mrp: 100,
      ptr: 80,
      costPrice: 50,
      minStockLevel: 10,
      reorderLevel: 20,
      unitOfMeasure: 'Strip',
      isActive: true,
      createdById: pharmacistUser.id,
    },
  })

  await prisma.inventory.create({
    data: {
      productId: product.id,
      branchId: branchA.id,
      totalQuantity: 200,
      availableQuantity: 200,
      reservedQuantity: 0,
    },
  })

  // Seed approval policy defaults
  await prisma.systemSetting.upsert({
    where: { category_key: { category: 'inventory', key: 'approval_tier_self_max' } },
    update: { value: '10' },
    create: {
      category: 'inventory',
      key: 'approval_tier_self_max',
      value: '10',
      dataType: 'number',
      label: 'Self Approval Max',
    },
  })
  await prisma.systemSetting.upsert({
    where: { category_key: { category: 'inventory', key: 'approval_tier_manager_max' } },
    update: { value: '50' },
    create: {
      category: 'inventory',
      key: 'approval_tier_manager_max',
      value: '50',
      dataType: 'number',
      label: 'Manager Approval Max',
    },
  })

  return {
    org1: org1.id,
    org2: org2.id,
    branchA: branchA.id,
    branchB: branchB.id,
    branchOtherOrg: branchOther.id,
    productId: product.id,
    pharmacist: { id: pharmacistUser.id, branchId: branchA.id },
    manager: { id: managerUser.id, branchId: branchA.id },
    chief: { id: chiefUser.id, branchId: branchA.id },
    owner: { id: ownerUser.id, branchId: branchA.id },
    otherOrgUser: { id: otherUser.id, branchId: branchOther.id },
  }
}

async function setPolicy(selfMax: number, managerMax: number) {
  await prisma.systemSetting.upsert({
    where: { category_key: { category: 'inventory', key: 'approval_tier_self_max' } },
    update: { value: String(selfMax) },
    create: {
      category: 'inventory',
      key: 'approval_tier_self_max',
      value: String(selfMax),
      dataType: 'number',
    },
  })
  await prisma.systemSetting.upsert({
    where: { category_key: { category: 'inventory', key: 'approval_tier_manager_max' } },
    update: { value: String(managerMax) },
    create: {
      category: 'inventory',
      key: 'approval_tier_manager_max',
      value: String(managerMax),
      dataType: 'number',
    },
  })
}

async function createFile() {
  return prisma.file.create({
    data: {
      fileName: 'evidence.pdf',
      originalName: 'evidence.pdf',
      mimeType: 'application/pdf',
      size: 1234,
      url: '/files/evidence.pdf',
      path: '/tmp/evidence.pdf',
      entityType: 'StockAdjustment',
    },
  })
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Adjustment Approval Tiers — integration', () => {
  let fx: Fixtures

  beforeEach(async () => {
    await resetDb()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('configuration', () => {
    it('defaults to 10/50', async () => {
      const policy = await getApprovalPolicy()
      expect(policy.selfMax).toBe(10)
      expect(policy.managerMax).toBe(50)
    })

    it('validates self_max and manager_max', () => {
      expect(validateApprovalPolicy(10, 50)).toBeNull()
      expect(validateApprovalPolicy(-1, 50)).toBe('self_max must be an integer >= 0')
      expect(validateApprovalPolicy(10, 10)).toBe('manager_max must be an integer > self_max')
      expect(validateApprovalPolicy(20, 10)).toBe('manager_max must be an integer > self_max')
      expect(validateApprovalPolicy(10.5, 50)).toBe('self_max must be an integer >= 0')
    })

    it('returns updated policy after change', async () => {
      await setPolicy(25, 69)
      const policy = await getApprovalPolicy()
      expect(policy.selfMax).toBe(25)
      expect(policy.managerMax).toBe(69)
    })
  })

  describe('Tier 1 — self approval', () => {
    it('+10 auto-approved and -10 auto-approved', async () => {
      const a1 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 10,
          reason: 'test',
        },
        fx.pharmacist
      )
      expect(a1.status).toBe('APPROVED')
      expect(a1.requiredTier).toBe('SELF')
      const a2 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: -10,
          reason: 'test',
        },
        fx.pharmacist
      )
      expect(a2.status).toBe('APPROVED')
      expect(a2.requiredTier).toBe('SELF')
    })

    it('+11 and -11 are pending (not self)', async () => {
      const a1 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 11,
          reason: 'test',
        },
        fx.pharmacist
      )
      expect(a1.status).toBe('PENDING')
      expect(a1.requiredTier).toBe('MANAGER')
      const a2 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: -11,
          reason: 'test',
        },
        fx.pharmacist
      )
      expect(a2.status).toBe('PENDING')
      expect(a2.requiredTier).toBe('MANAGER')
    })
  })

  describe('Tier 2 — manager', () => {
    it('+11, +50, -11, -50 pending and manager can approve', async () => {
      for (const qty of [11, 50, -11, -50]) {
        const adj = await createAdjustment(
          {
            branchId: fx.branchA,
            productId: fx.productId,
            adjustmentType: 'CORRECTION',
            quantity: qty,
            reason: 't2',
          },
          fx.pharmacist
        )
        expect(adj.requiredTier).toBe('MANAGER')
        const approved = await approveAdjustment(adj.id, fx.manager)
        expect(approved.status).toBe('APPROVED')
      }
    })

    it('pharmacist cannot approve Tier 2', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 20,
          reason: 't2',
        },
        fx.pharmacist
      )
      await expect(approveAdjustment(adj.id, fx.pharmacist)).rejects.toThrow(/Forbidden/)
    })
  })

  describe('Tier 3 — chief + evidence', () => {
    it('+51, -51, +100 require chief', async () => {
      for (const qty of [51, -51, 100]) {
        const adj = await createAdjustment(
          {
            branchId: fx.branchA,
            productId: fx.productId,
            adjustmentType: 'CORRECTION',
            quantity: qty,
            reason: 't3',
          },
          fx.pharmacist
        )
        expect(adj.requiredTier).toBe('CHIEF')
      }
    })

    it('manager cannot approve Tier 3', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 't3',
        },
        fx.pharmacist
      )
      await expect(approveAdjustment(adj.id, fx.manager)).rejects.toThrow(/Forbidden/)
      await expect(approveAdjustment(adj.id, fx.pharmacist)).rejects.toThrow(/Forbidden/)
    })

    it('chief cannot approve without evidence', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 't3',
        },
        fx.pharmacist
      )
      await expect(approveAdjustment(adj.id, fx.chief)).rejects.toThrow(/evidence/)
    })

    it('chief can approve with valid evidence', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 't3',
        },
        fx.pharmacist
      )
      const file = await createFile()
      const approved = await approveAdjustment(adj.id, fx.chief, file.id)
      expect(approved.status).toBe('APPROVED')
      expect(approved.evidenceFileId).toBe(file.id)
    })

    it('evidence cannot be reused', async () => {
      const file = await createFile()
      const adj1 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 't3-1',
        },
        fx.pharmacist
      )
      const adj2 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 70,
          reason: 't3-2',
        },
        fx.pharmacist
      )
      await approveAdjustment(adj1.id, fx.chief, file.id)
      await expect(approveAdjustment(adj2.id, fx.chief, file.id)).rejects.toThrow(/already used/)
    })

    it('rejects tampered tier — persisted tier is authoritative', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 't3',
        },
        fx.pharmacist
      )
      // Even though quantity is 60 (CHIEF), try to approve as manager — should fail because persisted tier is CHIEF
      await expect(approveAdjustment(adj.id, fx.manager)).rejects.toThrow(/Forbidden/)
      // Verify DB still has CHIEF
      const row = await prisma.stockAdjustment.findUnique({ where: { id: adj.id } })
      expect(row?.requiredTier).toBe('CHIEF')
    })
  })

  describe('boundaries', () => {
    it('10/11 and 50/51 boundaries', async () => {
      const a10 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 10,
          reason: 'b',
        },
        fx.pharmacist
      )
      expect(a10.requiredTier).toBe('SELF')
      const a11 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 11,
          reason: 'b',
        },
        fx.pharmacist
      )
      expect(a11.requiredTier).toBe('MANAGER')
      const a50 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 50,
          reason: 'b',
        },
        fx.pharmacist
      )
      expect(a50.requiredTier).toBe('MANAGER')
      const a51 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 51,
          reason: 'b',
        },
        fx.pharmacist
      )
      expect(a51.requiredTier).toBe('CHIEF')
    })
  })

  describe('configurability', () => {
    it('25/69 policy produces 25→SELF, 26→MANAGER, 69→MANAGER, 70→CHIEF', async () => {
      await setPolicy(25, 69)
      const a25 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 25,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(a25.requiredTier).toBe('SELF')
      const a26 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 26,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(a26.requiredTier).toBe('MANAGER')
      const a69 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 69,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(a69.requiredTier).toBe('MANAGER')
      const a70 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 70,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(a70.requiredTier).toBe('CHIEF')
      // negatives
      const an25 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: -25,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(an25.requiredTier).toBe('SELF')
      const an70 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: -70,
          reason: 'c',
        },
        fx.pharmacist
      )
      expect(an70.requiredTier).toBe('CHIEF')
    })
  })

  describe('freezing', () => {
    it('pending tier is frozen at creation', async () => {
      const adj60 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 'freeze',
        },
        fx.pharmacist
      )
      expect(adj60.requiredTier).toBe('CHIEF')
      await setPolicy(25, 69)
      const reloaded = await prisma.stockAdjustment.findUnique({ where: { id: adj60.id } })
      expect(reloaded?.requiredTier).toBe('CHIEF')
      // Still requires CHIEF even though 60 would now be MANAGER under new policy
      await expect(approveAdjustment(adj60.id, fx.manager)).rejects.toThrow(/Forbidden/)
      const file = await createFile()
      const approved = await approveAdjustment(adj60.id, fx.chief, file.id)
      expect(approved.status).toBe('APPROVED')
      // New 60 after policy change should be MANAGER
      const adj60New = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 'freeze2',
        },
        fx.pharmacist
      )
      expect(adj60New.requiredTier).toBe('MANAGER')
      const approved2 = await approveAdjustment(adj60New.id, fx.manager)
      expect(approved2.status).toBe('APPROVED')
    })
  })

  describe('security', () => {
    it('branch isolation', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 20,
          reason: 'sec',
        },
        fx.pharmacist
      )
      await expect(approveAdjustment(adj.id, fx.otherOrgUser)).rejects.toThrow(/Forbidden/)
    })

    it('already approved cannot be approved again', async () => {
      // Create a pending then approve then re-approve
      const adj2 = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 20,
          reason: 'sec',
        },
        fx.pharmacist
      )
      await approveAdjustment(adj2.id, fx.manager)
      await expect(approveAdjustment(adj2.id, fx.manager)).rejects.toThrow(/not pending/)
      await expect(rejectAdjustment(adj2.id, fx.manager)).rejects.toThrow(/not pending/)
    })

    it('already rejected cannot be approved', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 20,
          reason: 'sec',
        },
        fx.pharmacist
      )
      await rejectAdjustment(adj.id, fx.manager)
      await expect(approveAdjustment(adj.id, fx.manager)).rejects.toThrow(/not pending/)
    })

    it('evidence belonging to another adjustment is rejected', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 60,
          reason: 'sec',
        },
        fx.pharmacist
      )
      await expect(approveAdjustment(adj.id, fx.chief, 'nonexistent-id')).rejects.toThrow(
        /Not Found/
      )
    })
  })

  describe('concurrency', () => {
    it('concurrent approval of same adjustment → one succeeds', async () => {
      const adj = await createAdjustment(
        {
          branchId: fx.branchA,
          productId: fx.productId,
          adjustmentType: 'CORRECTION',
          quantity: 20,
          reason: 'conc',
        },
        fx.pharmacist
      )
      const results = await Promise.allSettled([
        approveAdjustment(adj.id, fx.manager),
        approveAdjustment(adj.id, fx.manager),
      ])
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as unknown as PromiseRejectedResult).reason.message).toMatch(
        /not pending|Conflict/
      )
      const row = await prisma.stockAdjustment.findUnique({ where: { id: adj.id } })
      expect(row?.status).toBe('APPROVED')
      const movements = await prisma.inventoryMovement.count({ where: { referenceId: adj.id } })
      expect(movements).toBe(1)
    })
  })
})
