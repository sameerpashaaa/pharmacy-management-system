/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Sale Return Narcotic (D2-E) — Real-Postgres integration tests.
//
// Covers the narcotic customer-return register integration:
//   - RESTOCK narcotic returns write a RETURN_TO_SUPPLIER register
//     entry inside the existing createSaleReturn transaction.
//   - Aggregation per productId + batchId honours the
//     @@unique([referenceType, referenceId, productId, batchId]).
//   - Fail-closed batch requirement for narcotic RESTOCK.
//   - Register credit only for RESTOCK (never DAMAGE_WRITE_OFF).
//   - cancelSale rejects cancellation of returned sales.
//
// These run against the dedicated local test container when
// DATABASE_URL is set. The suite skips itself when no DB is
// configured so the unit suite can run offline anywhere.
// ─────────────────────────────────────────────────────────────
import { NarcoticMovementType } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import type { AuthUser } from '@/lib/inventory/branch-access'
import { createSaleReturn } from '@/lib/returns/sale-return-service'
import { cancelSale, createSale } from '@/lib/sales/sales-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ─── Fixture state ────────────────────────────────────────────

interface Fixtures {
  branchAUser: AuthUser
  branchA: string
  narcoticProductId: string
  plainProductId: string
  userAId: string
  narcoticBatchId: string
  plainBatchId: string
  mrp: number
}

const TBLS = [
  'audit_logs',
  'batch_status_log',
  'sale_return_items',
  'sale_returns',
  'credit_notes',
  'customer_ledgers',
  'payments',
  'gst_transactions',
  'sale_item_batches',
  'sale_items',
  'sales',
  'schedule_h1_register',
  'narcotic_register',
  'inventory_movements',
  'batches',
  'inventory',
  'products',
  'customers',
  'doctors',
  'purchase_return_items',
  'purchase_returns',
  'purchase_items',
  'purchases',
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

  const branchA = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch A', code: 'A', invoicePrefix: 'INV' },
  })

  const userA = await prisma.user.create({
    data: { name: 'Alok', email: 'alok@pharma.test', branchId: branchA.id },
  })

  await prisma.doctor.create({
    data: {
      name: 'Dr Narcotic',
      registrationNo: 'MCI-NARC',
      organizationId: org1.id,
    },
  })

  const narcoticProduct = await prisma.product.create({
    data: {
      name: 'Morphine 10mg',
      sku: 'NAR-R-001',
      barcode: '99030001',
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      drugSchedule: 'NARCOTIC_NDPS',
      createdById: userA.id,
    },
  })
  const plainProduct = await prisma.product.create({
    data: {
      name: 'Paracetamol 500',
      sku: 'P-R-001',
      barcode: '99030002',
      mrp: 100,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })

  const narcoticBatch = await prisma.batch.create({
    data: {
      productId: narcoticProduct.id,
      branchId: branchA.id,
      batchNumber: 'NAR-R-B1',
      expiryDate: inDays(300),
      purchasePrice: 50,
      mrp: 100,
      quantity: 50,
      status: 'ACTIVE',
    },
  })
  await prisma.inventory.create({
    data: {
      productId: narcoticProduct.id,
      branchId: branchA.id,
      totalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
    },
  })

  const plainBatch = await prisma.batch.create({
    data: {
      productId: plainProduct.id,
      branchId: branchA.id,
      batchNumber: 'P-R-B1',
      expiryDate: inDays(300),
      purchasePrice: 50,
      mrp: 100,
      quantity: 50,
      status: 'ACTIVE',
    },
  })
  await prisma.inventory.create({
    data: {
      productId: plainProduct.id,
      branchId: branchA.id,
      totalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
    },
  })

  return {
    branchAUser: {
      id: userA.id,
      branchId: branchA.id,
      permissions: ['returns:create', 'sales:create', 'sales:void'],
    },
    branchA: branchA.id,
    narcoticProductId: narcoticProduct.id,
    plainProductId: plainProduct.id,
    userAId: userA.id,
    narcoticBatchId: narcoticBatch.id,
    plainBatchId: plainBatch.id,
    mrp: 100,
  }
}

async function seedOpening(
  fx: Fixtures,
  productId: string,
  batchId: string,
  balance: number
): Promise<void> {
  await prisma.narcoticRegister.create({
    data: {
      branchId: fx.branchA,
      productId,
      batchId,
      movementType: NarcoticMovementType.OPENING_BALANCE,
      quantityIn: balance,
      quantityOut: 0,
      balanceQuantity: balance,
      referenceType: 'OPENING',
      referenceId: `seed-open-${Date.now()}`,
      enteredById: fx.userAId,
      entryDate: new Date(Date.now() - 86400000),
    },
  })
}

interface SalePos {
  id: string
  itemIds: string[]
  batchIds: string[]
}

async function makeSale(fx: Fixtures, productId: string, quantity: number): Promise<SalePos> {
  const isNarcotic = productId === fx.narcoticProductId
  const sale = await createSale(
    {
      branchId: fx.branchA,
      items: [{ productId, quantity }],
      payments: [
        {
          method: 'CASH',
          amount: Math.round(quantity * fx.mrp * (isNarcotic ? 1.12 : 1)),
        },
      ],
      h1Capture: isNarcotic
        ? {
            patientName: 'Narc Patient',
            patientAddress: '1 Narc St',
            doctorName: 'Dr Narcotic',
            doctorRegNo: 'MCI-NARC',
          }
        : undefined,
    },
    fx.branchAUser
  )
  return {
    id: sale.id,
    itemIds: sale.items.map((i) => i.id),
    batchIds: sale.items.map((i) => i.itemBatches[0]?.batchId ?? ''),
  }
}

async function narcoticRows(productId: string, branchId: string) {
  return prisma.narcoticRegister.findMany({
    where: { productId, branchId },
    orderBy: { entryDate: 'asc' },
  })
}

async function returnRows(retId: string) {
  return prisma.narcoticRegister.findMany({
    where: { referenceType: 'SALE_RETURN', referenceId: retId },
  })
}

// ─── Tests ────────────────────────────────────────────────────

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Sale return narcotic register (D2-E, real Postgres)', () => {
  let fx: Fixtures

  beforeEach(async () => {
    await resetDb()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('D2-E-1: narcotic RESTOCK writes a RETURN_TO_SUPPLIER register entry', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = sale.batchIds[0]
    expect(batchId).toBeTruthy()

    const ret = await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Customer returned narcotic strip',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: sale.itemIds[0],
            quantity: 3,
            restockDecision: 'RESTOCK',
            batchId,
          },
        ],
      },
      fx.branchAUser
    )

    const rows = await returnRows(ret!.id)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(row.quantityIn).toBe(3)
    expect(row.quantityOut).toBe(0)
    expect(row.productId).toBe(fx.narcoticProductId)
    expect(row.batchId).toBe(batchId)
    expect(row.branchId).toBe(fx.branchA)
    expect(row.enteredById).toBe(fx.userAId)
    // opening 100 → sale 10 → balance 90 → return +3 → 93
    expect(row.balanceQuantity).toBe(93)
  })

  it('D2-E-2: customer return increases the existing D2-G balance chain', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = sale.batchIds[0]

    const ret = await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Return 5',
        refundMethod: 'CASH',
        items: [{ saleItemId: sale.itemIds[0], quantity: 5, restockDecision: 'RESTOCK', batchId }],
      },
      fx.branchAUser
    )

    const rows = await narcoticRows(fx.narcoticProductId, fx.branchA)
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 90, 95])
    expect(rows[2].movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(rows[2].quantityIn).toBe(5)
    expect(rows[2].quantityOut).toBe(0)
    expect(rows[2].referenceType).toBe('SALE_RETURN')
    expect(rows[2].referenceId).toBe(ret!.id)
  })

  it('D2-E-3: non-narcotic customer RESTOCK creates no NarcoticRegister row', async () => {
    const sale = await makeSale(fx, fx.plainProductId, 5)
    const batchId = sale.batchIds[0]

    await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Plain return',
        refundMethod: 'CASH',
        items: [{ saleItemId: sale.itemIds[0], quantity: 2, restockDecision: 'RESTOCK', batchId }],
      },
      fx.branchAUser
    )

    const rows = await prisma.narcoticRegister.findMany({ where: { branchId: fx.branchA } })
    expect(rows).toHaveLength(0)
  })

  it('D2-E-4: physical inventory, batch, movement, returnedQuantity and register stay in sync', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = sale.batchIds[0]

    const batchBefore = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batchBefore.soldQuantity).toBe(10)
    expect(batchBefore.quantity).toBe(50)

    const ret = await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Return 4',
        refundMethod: 'CASH',
        items: [{ saleItemId: sale.itemIds[0], quantity: 4, restockDecision: 'RESTOCK', batchId }],
      },
      fx.branchAUser
    )

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    // seeded 50 → sale -10 → 40 → return +4 → 44
    expect(inv.totalQuantity).toBe(44)
    expect(inv.availableQuantity).toBe(44)

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.quantity).toBe(54)
    expect(batch.soldQuantity).toBe(6)

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'SALE_RETURN', referenceId: ret!.id, inventoryId: inv.id },
    })
    expect(movement).toBeTruthy()
    expect(movement!.type).toBe('RETURN_IN')
    expect(movement!.quantity).toBe(4)
    expect(movement!.batchId).toBe(batchId)

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBe(4)

    const rows = await returnRows(ret!.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityIn).toBe(4)
    // opening 100 → sale 10 → 90 → return +4 → 94
    expect(rows[0].balanceQuantity).toBe(94)
  })

  it('D2-E-5: narcotic DAMAGE_WRITE_OFF creates no register row and does not restore stock', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = sale.batchIds[0]

    await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Damaged narcotic',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: sale.itemIds[0],
            quantity: 3,
            restockDecision: 'DAMAGE_WRITE_OFF',
            batchId,
          },
        ],
      },
      fx.branchAUser
    )

    const rows = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE_RETURN' },
    })
    expect(rows).toHaveLength(0)

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    expect(inv.availableQuantity).toBe(40)

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.quantity).toBe(50)
    expect(batch.soldQuantity).toBe(10)

    const writeOff = await prisma.inventoryMovement.findFirst({
      where: { type: 'WRITE_OFF', referenceType: 'SALE_RETURN' },
    })
    expect(writeOff).toBeTruthy()
  })

  it('D2-E-6: narcotic RESTOCK with no resolvable batch is rejected with zero durable mutation', async () => {
    const sale = await prisma.sale.create({
      data: {
        branchId: fx.branchA,
        invoiceNumber: `INV-D2E6-${Date.now()}`,
        subtotal: 500,
        totalAmount: 500,
        createdById: fx.userAId,
        saleDate: new Date(),
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId: fx.narcoticProductId,
              productName: 'Morphine 10mg',
              productSku: 'NAR-R-001',
              mrp: 100,
              quantity: 5,
              unitPrice: 100,
              totalAmount: 500,
              returnedQuantity: 0,
            },
          ],
        },
      },
      include: { items: true },
    })
    const saleItemId = sale.items[0].id

    const movementCountBefore = await prisma.inventoryMovement.count()
    const registerCountBefore = await prisma.narcoticRegister.count()

    await expect(
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'No batch',
          refundMethod: 'CASH',
          items: [{ saleItemId, quantity: 1, restockDecision: 'RESTOCK' }],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Batch ID is required for narcotic customer returns')

    expect(await prisma.saleReturn.count()).toBe(0)
    expect(await prisma.saleReturnItem.count()).toBe(0)
    expect(await prisma.inventoryMovement.count()).toBe(movementCountBefore)
    expect(await prisma.narcoticRegister.count()).toBe(registerCountBefore)

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    expect(inventory.availableQuantity).toBe(50)
  })

  it('D2-E-7: register failure rolls back the entire return transaction atomically', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = sale.batchIds[0]

    const inventoryBefore = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    const batchBefore = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    const movementCountBefore = await prisma.inventoryMovement.count()
    const registerCountBefore = await prisma.narcoticRegister.count()

    const ghostActor = { id: 'ghost-user-d2e7', branchId: null }

    await expect(
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'Atomicity probe',
          refundMethod: 'CASH',
          items: [
            { saleItemId: sale.itemIds[0], quantity: 2, restockDecision: 'RESTOCK', batchId },
          ],
        },
        ghostActor
      )
    ).rejects.toThrow()

    expect(await prisma.saleReturn.count()).toBe(0)
    expect(await prisma.saleReturnItem.count()).toBe(0)

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcoticProductId, branchId: fx.branchA } },
    })
    expect(inventory.availableQuantity).toBe(inventoryBefore.availableQuantity)

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.soldQuantity).toBe(batchBefore.soldQuantity)
    expect(batch.quantity).toBe(batchBefore.quantity)

    expect(await prisma.inventoryMovement.count()).toBe(movementCountBefore)
    expect(await prisma.narcoticRegister.count()).toBe(registerCountBefore)

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBe(0)
  })

  it('D2-E-8: cancelSale rejects cancellation of partially/fully returned sales but leaves COMPLETED cancellation unchanged', async () => {
    const narcSale = await makeSale(fx, fx.narcoticProductId, 10)
    const batchId = narcSale.batchIds[0]

    // Partial return → PARTIALLY_RETURNED → cancel must be rejected
    await createSaleReturn(
      {
        saleId: narcSale.id,
        reason: 'Part back',
        refundMethod: 'CASH',
        items: [
          { saleItemId: narcSale.itemIds[0], quantity: 3, restockDecision: 'RESTOCK', batchId },
        ],
      },
      fx.branchAUser
    )
    await expect(cancelSale(narcSale.id, 'After return', fx.branchAUser)).rejects.toThrow(
      'Cannot cancel a sale that has been returned'
    )

    // Full return → FULLY_RETURNED → cancel must be rejected
    await createSaleReturn(
      {
        saleId: narcSale.id,
        reason: 'All back',
        refundMethod: 'CASH',
        items: [
          { saleItemId: narcSale.itemIds[0], quantity: 7, restockDecision: 'RESTOCK', batchId },
        ],
      },
      fx.branchAUser
    )
    await expect(cancelSale(narcSale.id, 'After full return', fx.branchAUser)).rejects.toThrow(
      'Cannot cancel a sale that has been returned'
    )

    // COMPLETED sale with no return → cancellation behaviour unchanged
    const freshSale = await makeSale(fx, fx.narcoticProductId, 4)
    await cancelSale(freshSale.id, 'Plain void', fx.branchAUser)
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: freshSale.id } })
    expect(sale.status).toBe('CANCELLED')
  })

  it('D2-E-9: two return lines for the same product + batch aggregate into one register row', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)

    // Build a two-item sale directly: two sale items of the same product
    // and batch (createSale itself would collide on the register unique
    // key with two identical product/batch allocations, so seed the
    // sale and its SALES_DISPENSE row directly).
    const sale = await prisma.sale.create({
      data: {
        branchId: fx.branchA,
        invoiceNumber: `INV-D2E9-${Date.now()}`,
        subtotal: 500,
        totalAmount: 500,
        createdById: fx.userAId,
        saleDate: new Date(),
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId: fx.narcoticProductId,
              productName: 'Morphine 10mg',
              productSku: 'NAR-R-001',
              mrp: 100,
              quantity: 2,
              unitPrice: 100,
              totalAmount: 200,
              returnedQuantity: 0,
              itemBatches: {
                create: [{ batchId: fx.narcoticBatchId, quantity: 2, unitPrice: 100 }],
              },
            },
            {
              productId: fx.narcoticProductId,
              productName: 'Morphine 10mg',
              productSku: 'NAR-R-001',
              mrp: 100,
              quantity: 3,
              unitPrice: 100,
              totalAmount: 300,
              returnedQuantity: 0,
              itemBatches: {
                create: [{ batchId: fx.narcoticBatchId, quantity: 3, unitPrice: 100 }],
              },
            },
          ],
        },
      },
      include: { items: true },
    })

    await prisma.narcoticRegister.create({
      data: {
        branchId: fx.branchA,
        productId: fx.narcoticProductId,
        batchId: fx.narcoticBatchId,
        movementType: NarcoticMovementType.SALES_DISPENSE,
        quantityIn: 0,
        quantityOut: 5,
        balanceQuantity: 95,
        referenceType: 'SALE',
        referenceId: sale.id,
        enteredById: fx.userAId,
        entryDate: new Date(),
      },
    })

    const ret = await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'Two strips back',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: sale.items[0].id,
            quantity: 2,
            restockDecision: 'RESTOCK',
            batchId: fx.narcoticBatchId,
          },
          {
            saleItemId: sale.items[1].id,
            quantity: 3,
            restockDecision: 'RESTOCK',
            batchId: fx.narcoticBatchId,
          },
        ],
      },
      fx.branchAUser
    )

    const rows = await returnRows(ret!.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].productId).toBe(fx.narcoticProductId)
    expect(rows[0].batchId).toBe(fx.narcoticBatchId)
    expect(rows[0].quantityIn).toBe(5)
    expect(rows[0].quantityOut).toBe(0)
    // opening 100 → dispense 5 → 95 → return +5 → 100
    expect(rows[0].balanceQuantity).toBe(100)
  })
})
