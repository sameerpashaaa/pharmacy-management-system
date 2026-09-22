/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Batch Disposal (D2-D) — Real-Postgres integration tests.
//
// Covers narcotic disposal writing a DESTRUCTION register entry with
// D2-G running-balance semantics, inside the existing disposeBatch
// transaction. Non-narcotic disposal behavior is unchanged.
//
// These run against the dedicated local test container when
// DATABASE_URL is set. The suite skips itself when no DB is
// configured so the unit suite can run offline anywhere.
// ─────────────────────────────────────────────────────────────
import { NarcoticMovementType } from '@prisma/client'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { disposeBatch } from '@/lib/batches/batch-service'
import prisma from '@/lib/db/prisma'
import type { AuthUser } from '@/lib/inventory/branch-access'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ─── Fixture state ────────────────────────────────────────────

interface Fixtures {
  branchAUser: AuthUser
  otherOrgUser: AuthUser
  branchA: string
  narcoticProductId: string
  plainProductId: string
  userAId: string
}

const TBLS = [
  'audit_logs',
  'batch_status_log',
  'batch_disposals',
  'narcotic_register',
  'inventory_movements',
  'batches',
  'inventory',
  'products',
  'users',
  'branches',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 86400000)
}

async function seedFixtures(): Promise<Fixtures> {
  const org1 = await prisma.organization.create({ data: { name: 'Org One' } })
  const org2 = await prisma.organization.create({ data: { name: 'Org Two' } })

  const branchA = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch A', code: 'A', invoicePrefix: 'INV' },
  })
  const branchC = await prisma.branch.create({
    data: { organizationId: org2.id, name: 'Branch C', code: 'C', invoicePrefix: 'INV' },
  })

  const userA = await prisma.user.create({
    data: { name: 'Alok', email: 'alok@pharma.test', branchId: branchA.id },
  })
  const userOther = await prisma.user.create({
    data: { name: 'Chand', email: 'chand@pharma.test', branchId: branchC.id },
  })

  const narcoticProduct = await prisma.product.create({
    data: {
      name: 'Morphine 10mg',
      sku: 'NAR-D-001',
      barcode: '99020001',
      mrp: 100,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Strip',
      drugSchedule: 'NARCOTIC_NDPS',
      createdById: userA.id,
    },
  })
  const plainProduct = await prisma.product.create({
    data: {
      name: 'Paracetamol 500',
      sku: 'P-D-001',
      barcode: '99020002',
      mrp: 100,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })

  return {
    branchAUser: { id: userA.id, branchId: branchA.id },
    otherOrgUser: { id: userOther.id, branchId: branchC.id },
    branchA: branchA.id,
    narcoticProductId: narcoticProduct.id,
    plainProductId: plainProduct.id,
    userAId: userA.id,
  }
}

async function makeBatch(
  fx: Fixtures,
  productId: string,
  batchNumber: string,
  quantity: number,
  branchId: string | null = fx.branchA
): Promise<string> {
  const batch = await prisma.batch.create({
    data: {
      productId,
      batchNumber,
      expiryDate: inDays(300),
      purchasePrice: 10,
      mrp: 100,
      quantity,
      branchId,
    },
  })
  if (branchId) {
    await prisma.inventory.create({
      data: {
        productId,
        branchId,
        totalQuantity: quantity,
        availableQuantity: quantity,
        reservedQuantity: 0,
      },
    })
  }
  return batch.id
}

async function seedRegisterRow(
  fx: Fixtures,
  productId: string,
  batchId: string,
  movementType: NarcoticMovementType,
  quantityIn: number,
  balanceQuantity: number,
  entryDate: Date
): Promise<void> {
  await prisma.narcoticRegister.create({
    data: {
      branchId: fx.branchA,
      productId,
      batchId,
      movementType,
      quantityIn,
      quantityOut: 0,
      balanceQuantity,
      referenceType: 'OPENING',
      referenceId: `seed-${Date.now()}`,
      enteredById: fx.userAId,
      entryDate,
    },
  })
}

async function narcoticRows(productId: string, branchId: string) {
  return prisma.narcoticRegister.findMany({
    where: { productId, branchId },
    orderBy: { entryDate: 'asc' },
  })
}

// ─── Tests ────────────────────────────────────────────────────

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Batch disposal narcotic register (D2-D, real Postgres)', () => {
  let fx: Fixtures

  beforeEach(async () => {
    await resetDb()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('D2-D-1: disposing a narcotic batch writes a DESTRUCTION register entry', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-1', 100)
    await seedRegisterRow(
      fx,
      fx.narcoticProductId,
      batchId,
      NarcoticMovementType.OPENING_BALANCE,
      100,
      100,
      new Date(Date.now() - 10000)
    )

    await disposeBatch(batchId, { quantity: 10, reason: 'DAMAGED' }, fx.branchAUser)

    const rows = await narcoticRows(fx.narcoticProductId, fx.branchA)
    expect(rows).toHaveLength(2)
    const entry = rows[1]
    expect(entry.movementType).toBe(NarcoticMovementType.DESTRUCTION)
    expect(entry.referenceType).toBe('DISPOSAL')
    expect(entry.productId).toBe(fx.narcoticProductId)
    expect(entry.batchId).toBe(batchId)
    expect(entry.branchId).toBe(fx.branchA)
    expect(entry.quantityIn).toBe(0)
    expect(entry.quantityOut).toBe(10)
    expect(entry.balanceQuantity).toBe(90)
    expect(entry.enteredById).toBe(fx.userAId)

    const disposal = await prisma.batchDisposal.findFirst({ where: { batchId } })
    expect(disposal).not.toBeNull()
    expect(entry.referenceId).toBe(disposal!.id)
  })

  it('D2-D-2: destruction chains off the latest balance (120 -> 115)', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-2', 100)
    await seedRegisterRow(
      fx,
      fx.narcoticProductId,
      batchId,
      NarcoticMovementType.OPENING_BALANCE,
      100,
      100,
      new Date(Date.now() - 20000)
    )
    await seedRegisterRow(
      fx,
      fx.narcoticProductId,
      batchId,
      NarcoticMovementType.PURCHASE_RECEIPT,
      20,
      120,
      new Date(Date.now() - 10000)
    )

    await disposeBatch(batchId, { quantity: 5, reason: 'DAMAGED' }, fx.branchAUser)

    const rows = await narcoticRows(fx.narcoticProductId, fx.branchA)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.movementType)).toEqual([
      NarcoticMovementType.OPENING_BALANCE,
      NarcoticMovementType.PURCHASE_RECEIPT,
      NarcoticMovementType.DESTRUCTION,
    ])
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 120, 115])
  })

  it('D2-D-3: inventory and batch state stay synchronized on narcotic disposal', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-3', 100)

    await disposeBatch(batchId, { quantity: 10, reason: 'EXPIRED' }, fx.branchAUser)

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.quantity).toBe(90)
    expect(batch.status).toBe('ACTIVE')

    const inv = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    expect(inv?.totalQuantity).toBe(90)
    expect(inv?.availableQuantity).toBe(90)

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'WRITE_OFF', batchId },
    })
    expect(movement).not.toBeNull()
    expect(movement?.quantity).toBe(-10)

    // No prior register history: balance starts from zero.
    const rows = await narcoticRows(fx.narcoticProductId, fx.branchA)
    expect(rows).toHaveLength(1)
    expect(rows[0].balanceQuantity).toBe(-10)
  })

  it('D2-D-4: non-narcotic disposal writes no register entry', async () => {
    const batchId = await makeBatch(fx, fx.plainProductId, 'BT-D2D-4', 100)

    await disposeBatch(batchId, { quantity: 10, reason: 'DAMAGED' }, fx.branchAUser)

    expect(await narcoticRows(fx.plainProductId, fx.branchA)).toHaveLength(0)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(90)
  })

  it('D2-D-5: full disposal marks the batch DISPOSED and still records destruction', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-5', 10)

    const result = await disposeBatch(batchId, { quantity: 10, reason: 'EXPIRED' }, fx.branchAUser)
    expect(result.status).toBe('DISPOSED')

    const rows = await narcoticRows(fx.narcoticProductId, fx.branchA)
    expect(rows).toHaveLength(1)
    expect(rows[0].movementType).toBe(NarcoticMovementType.DESTRUCTION)
    expect(rows[0].quantityOut).toBe(10)
  })

  it('D2-D-6: branchless batch disposal succeeds without a register entry', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-6', 100, null)

    await disposeBatch(batchId, { quantity: 10, reason: 'DAMAGED' }, fx.branchAUser)

    expect(await prisma.narcoticRegister.count()).toBe(0)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(90)
  })

  it('D2-D-7: failed disposal leaves zero durable mutation', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-7', 100)

    await expect(
      disposeBatch(batchId, { quantity: 101, reason: 'DAMAGED' }, fx.branchAUser)
    ).rejects.toThrow('Insufficient available quantity')

    expect(await prisma.batchDisposal.count({ where: { batchId } })).toBe(0)
    expect(await narcoticRows(fx.narcoticProductId, fx.branchA)).toHaveLength(0)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(100)
    const inv = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    expect(inv?.totalQuantity).toBe(100)
    expect(inv?.availableQuantity).toBe(100)
  })

  it('D2-D-8: batches:dispose permission is required at the route', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:dispose'")
    )
    const { POST } = await import('@/app/api/batches/[id]/dispose/route')
    const res = await POST(
      new Request('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 10, reason: 'DAMAGED' }),
      }) as unknown as Parameters<typeof POST>[0],
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(403)
    expect(await prisma.batchDisposal.count()).toBe(0)
  })

  it('D2-D-9: cross-organization disposal is denied', async () => {
    const batchId = await makeBatch(fx, fx.narcoticProductId, 'BT-D2D-9', 100)

    await expect(
      disposeBatch(batchId, { quantity: 10, reason: 'DAMAGED' }, fx.otherOrgUser)
    ).rejects.toThrow('Forbidden')
    expect(await prisma.batchDisposal.count({ where: { batchId } })).toBe(0)
    expect(await narcoticRows(fx.narcoticProductId, fx.branchA)).toHaveLength(0)
  })
})
