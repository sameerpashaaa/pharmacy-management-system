/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Customer Return / Cancellation Concurrency (Remediation #2)
// — Real-Postgres integration tests.
//
// createSaleReturn now runs under Serializable isolation with the
// shared P2002/P2034 retry policy and evaluates its sale snapshot,
// status guards, return cap and narcotic batch resolution from the
// freshly serialized snapshot inside the transaction. These tests
// prove the read-validate-write cycle cannot be defeated by
// concurrent returns or a concurrent cancellation:
//
//   T1  6 + 6 concurrent returns against quantity 10  → at most one
//       commits; returnedQuantity stays 6 (never 12).
//   T2  5 + 5 concurrent returns against remaining 10 → both
//       legitimate operations commit, serially.
//   T3  concurrent cancel + return                    → exactly one
//       business effect wins; never a double restore.
//   T4  sequential cancel after FULLY_RETURNED        → rejected,
//       zero mutation (D2-E-8 regression).
//   T5  concurrent narcotic RESTOCK 6 + 6 on 10       → at most one
//       commits; register credit equals committed qty.
//   T6  concurrent legitimate CREDIT 4 + 6 on 10      → both commit,
//       two credit notes, chained ledger, correct balance.
//   T7  mid-transaction failure                       → full rollback
//       (no SaleReturn/inventory/batch/movement/note/ledger change).
//   T8  invariant sweep across a return               → cap, sums,
//       physical state, status and register invariants hold.
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
    data: { name: 'Alok', email: 'cc-alok@pharma.test', branchId: branchA.id },
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

async function inventoryFor(productId: string, branchId: string) {
  return prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  })
}

async function batchById(id: string) {
  return prisma.batch.findUnique({ where: { id } })
}

async function returnInMovements(): Promise<number> {
  return prisma.inventoryMovement.count({ where: { type: 'RETURN_IN' } })
}

function latestRegisterBalance(fx: Fixtures): Promise<{ balanceQuantity: number } | null> {
  return prisma.narcoticRegister.findFirst({
    where: { branchId: fx.branchA, productId: fx.narcoticProductId },
    orderBy: { entryDate: 'desc' },
    select: { balanceQuantity: true },
  })
}

function failureOf(result: PromiseSettledResult<unknown>): string {
  return result.status === 'rejected' && result.reason instanceof Error
    ? result.reason.message
    : String(result.status === 'rejected' ? result.reason : result)
}

// ─── Tests ────────────────────────────────────────────────────

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Customer return / cancel concurrency (Remediation #2, real Postgres)', () => {
  let fx: Fixtures

  beforeEach(async () => {
    await resetDb()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('T1: 6 + 6 concurrent returns against quantity 10 — at most one commits, never 12', async () => {
    const sale = await makeSale(fx, fx.plainProductId, 10)
    const movementsBefore = await returnInMovements()

    const ret = (qty: number) =>
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T1 over-cap pair',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: sale.itemIds[0],
              quantity: qty,
              restockDecision: 'RESTOCK',
              batchId: fx.plainBatchId,
            },
          ],
        },
        fx.branchAUser
      )

    const results = await Promise.allSettled([ret(6), ret(6)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')

    expect(fulfilled.length).toBeLessThanOrEqual(1)
    for (const r of results) {
      if (r.status === 'rejected') {
        // Expected dominant path: the retried loser re-reads the committed
        // returnedQuantity and reports the fresh cap. Conflict is tolerated
        // only as the theoretical all-attempts-exhausted fallback.
        expect(failureOf(r)).toMatch(
          /only 4 units remain unreturned|Conflict: a concurrent sale changed the data, please retry/
        )
      }
    }

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBe(6)

    // 50 - 10 sold + 6 restored = 46; a lost race would show 52.
    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    expect(inv?.availableQuantity).toBe(46)
    expect(inv?.totalQuantity).toBe(46)

    const batch = await batchById(fx.plainBatchId)
    expect(batch?.quantity).toBe(56)
    expect(batch?.soldQuantity).toBe(4)

    expect(await returnInMovements()).toBe(movementsBefore + 1)

    const saleRow = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(saleRow.status).toBe('PARTIALLY_RETURNED')
  })

  it('T2: 5 + 5 concurrent returns against remaining 10 — both commit serially', async () => {
    const sale = await makeSale(fx, fx.plainProductId, 10)
    const movementsBefore = await returnInMovements()

    const ret = (qty: number) =>
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T2 legitimate pair',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: sale.itemIds[0],
              quantity: qty,
              restockDecision: 'RESTOCK',
              batchId: fx.plainBatchId,
            },
          ],
        },
        fx.branchAUser
      )

    const results = await Promise.allSettled([ret(5), ret(5)])
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2)

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBe(10)

    const saleRow = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(saleRow.status).toBe('FULLY_RETURNED')

    // 50 - 10 sold + 10 restored = 50; exactly one 10-unit restoration.
    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    expect(inv?.availableQuantity).toBe(50)
    expect(inv?.totalQuantity).toBe(50)

    const batch = await batchById(fx.plainBatchId)
    expect(batch?.quantity).toBe(60)
    expect(batch?.soldQuantity).toBe(0)

    expect(await returnInMovements()).toBe(movementsBefore + 2)
  })

  it('T3: concurrent cancel + return — exactly one business effect wins, never a double restore', async () => {
    const sale = await makeSale(fx, fx.plainProductId, 10)
    const movementsBefore = await returnInMovements()

    await Promise.allSettled([
      cancelSale(sale.id, 'T3 concurrent void', fx.branchAUser),
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T3 concurrent return',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: sale.itemIds[0],
              quantity: 4,
              restockDecision: 'RESTOCK',
              batchId: fx.plainBatchId,
            },
          ],
        },
        fx.branchAUser
      ),
    ])

    const saleRow = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    const returnCount = await prisma.saleReturn.count({ where: { saleId: sale.id } })
    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    const batch = await batchById(fx.plainBatchId)
    const movementDelta = (await returnInMovements()) - movementsBefore

    // Exactly one winner: zero or one SaleReturn, exactly one restoration movement.
    expect(returnCount).toBeLessThanOrEqual(1)
    expect(movementDelta).toBe(1)

    if (saleRow.status === 'CANCELLED') {
      // Cancellation won — the return must not have restored anything.
      // createSale only tracks soldQuantity, so batch quantity is untouched
      // by both the sale and the cancellation; RESTOCK would have added.
      expect(returnCount).toBe(0)
      expect(inv?.availableQuantity).toBe(50)
      expect(batch?.soldQuantity).toBe(0)
      expect(batch?.quantity).toBe(50)
    } else {
      // Return won — cancellation must not have applied.
      expect(saleRow.status).toBe('PARTIALLY_RETURNED')
      expect(returnCount).toBe(1)
      expect(inv?.availableQuantity).toBe(44)
      expect(batch?.soldQuantity).toBe(6)
      expect(batch?.quantity).toBe(54)
    }
  })

  it('T4: sequential cancel after FULLY_RETURNED is rejected with zero mutation (D2-E-8 regression)', async () => {
    const sale = await makeSale(fx, fx.plainProductId, 10)
    await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'T4 full return',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: sale.itemIds[0],
            quantity: 10,
            restockDecision: 'RESTOCK',
            batchId: fx.plainBatchId,
          },
        ],
      },
      fx.branchAUser
    )

    const invBefore = await inventoryFor(fx.plainProductId, fx.branchA)
    const batchBefore = await batchById(fx.plainBatchId)
    const movementsBefore = await returnInMovements()

    await expect(cancelSale(sale.id, 'T4 after full return', fx.branchAUser)).rejects.toThrow(
      'Cannot cancel a sale that has been returned'
    )

    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    const batch = await batchById(fx.plainBatchId)
    expect(inv?.availableQuantity).toBe(invBefore?.availableQuantity)
    expect(batch?.quantity).toBe(batchBefore?.quantity)
    expect(batch?.soldQuantity).toBe(batchBefore?.soldQuantity)
    expect(await returnInMovements()).toBe(movementsBefore)
  })

  it('T5: concurrent narcotic RESTOCK returns 6 + 6 on 10 — single winner, register credit equals committed qty', async () => {
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const sale = await makeSale(fx, fx.narcoticProductId, 10)
    const prevBalance = (await latestRegisterBalance(fx))?.balanceQuantity ?? 0

    const ret = (qty: number) =>
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T5 narcotic over-cap pair',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: sale.itemIds[0],
              quantity: qty,
              restockDecision: 'RESTOCK',
              batchId: fx.narcoticBatchId,
            },
          ],
        },
        fx.branchAUser
      )

    const results = await Promise.allSettled([ret(6), ret(6)])
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1)
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(failureOf(r)).toMatch(
          /only 4 units remain unreturned|Conflict: a concurrent sale changed the data, please retry/
        )
      }
    }

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBe(6)
    expect(saleItem.returnedQuantity).toBeLessThanOrEqual(
      (await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })).quantity
    )

    const registerRows = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE_RETURN' },
    })
    expect(registerRows.length).toBe(1)
    expect(registerRows[0].quantityIn).toBe(6)
    expect(registerRows[0].quantityOut).toBe(0)
    expect(registerRows[0].movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(registerRows[0].balanceQuantity).toBe(prevBalance + 6)

    const inv = await inventoryFor(fx.narcoticProductId, fx.branchA)
    expect(inv?.availableQuantity).toBe(46)
    const batch = await batchById(fx.narcoticBatchId)
    expect(batch?.soldQuantity).toBe(4)
  })

  it('T6: concurrent legitimate CREDIT returns 4 + 6 on 10 — two notes, chained ledger, correct balance', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Credit Cust', outstandingBalance: 1000 },
    })
    const sale = await prisma.sale.create({
      data: {
        branchId: fx.branchA,
        customerId: customer.id,
        invoiceNumber: `INV-CREDIT-${Date.now()}`,
        subtotal: 1000,
        totalAmount: 1000,
        createdById: fx.userAId,
        saleDate: new Date(),
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId: fx.plainProductId,
              productName: 'Paracetamol 500',
              productSku: 'P-R-001',
              mrp: 100,
              quantity: 10,
              unitPrice: 100,
              totalAmount: 1000,
              returnedQuantity: 0,
              itemBatches: {
                create: [{ batchId: fx.plainBatchId, quantity: 10, unitPrice: 100 }],
              },
            },
          ],
        },
      },
      include: { items: true },
    })

    const ret = (qty: number) =>
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T6 legit CREDIT pair',
          refundMethod: 'CREDIT',
          items: [
            {
              saleItemId: sale.items[0].id,
              quantity: qty,
              restockDecision: 'RESTOCK',
              batchId: fx.plainBatchId,
            },
          ],
        },
        fx.branchAUser
      )

    const results = await Promise.allSettled([ret(4), ret(6)])
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2)

    const notes = await prisma.creditNote.findMany({ where: { customerId: customer.id } })
    expect(notes.length).toBe(2)
    expect(new Set(notes.map((n) => n.noteNumber)).size).toBe(2)
    const noteAmounts = notes.map((n) => n.amount.toNumber()).sort((a, b) => a - b)
    expect(noteAmounts).toEqual([400, 600])

    const ledger = await prisma.customerLedger.findMany({
      where: { customerId: customer.id, referenceType: 'SALE_RETURN' },
    })
    expect(ledger.length).toBe(2)
    expect(ledger.every((l) => l.type === 'CREDIT')).toBe(true)
    // Credits applied serially: whichever credit ran first carries the pre-pair
    // balance, the other carries the final balance. Sort by balance descending
    // so the chain is order-independent: row0 = 1000 - its amount,
    // row1 = row0 - its amount. A lost update would leave a missing rung.
    const sorted = [...ledger].sort((a, b) => b.balance.toNumber() - a.balance.toNumber())
    expect(sorted[0].balance.toNumber()).toBe(1000 - sorted[0].amount.toNumber())
    expect(sorted[1].balance.toNumber()).toBe(
      sorted[0].balance.toNumber() - sorted[1].amount.toNumber()
    )

    const updated = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(updated.outstandingBalance.toNumber()).toBe(0)
  })

  it('T7: mid-transaction failure rolls back every side effect (CREDIT + RESTOCK + batch)', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Rollback Cust', outstandingBalance: 500 },
    })
    const sale = await prisma.sale.create({
      data: {
        branchId: fx.branchA,
        customerId: customer.id,
        invoiceNumber: `INV-ROLLBACK-${Date.now()}`,
        subtotal: 1000,
        totalAmount: 1000,
        createdById: fx.userAId,
        saleDate: new Date(),
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId: fx.plainProductId,
              productName: 'Paracetamol 500',
              productSku: 'P-R-001',
              mrp: 100,
              quantity: 10,
              unitPrice: 100,
              totalAmount: 1000,
              returnedQuantity: 0,
              itemBatches: {
                create: [{ batchId: fx.plainBatchId, quantity: 10, unitPrice: 100 }],
              },
            },
          ],
        },
      },
      include: { items: true },
    })

    const invBefore = await inventoryFor(fx.plainProductId, fx.branchA)
    const batchBefore = await batchById(fx.plainBatchId)
    const movementsBefore = await returnInMovements()
    const notesBefore = await prisma.creditNote.count()
    const ledgerBefore = await prisma.customerLedger.count()
    const returnRowsBefore = await prisma.saleReturn.count()

    const ghost = { id: 'ghost-rollback-t7', branchId: null }

    await expect(
      createSaleReturn(
        {
          saleId: sale.id,
          reason: 'T7 rollback probe',
          refundMethod: 'CREDIT',
          items: [
            {
              saleItemId: sale.items[0].id,
              quantity: 4,
              restockDecision: 'RESTOCK',
              batchId: fx.plainBatchId,
            },
          ],
        },
        ghost
      )
    ).rejects.toThrow()

    expect(await prisma.saleReturn.count()).toBe(returnRowsBefore)
    expect(await prisma.saleReturnItem.count()).toBe(0)

    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    const batch = await batchById(fx.plainBatchId)
    expect(inv?.availableQuantity).toBe(invBefore?.availableQuantity)
    expect(inv?.totalQuantity).toBe(invBefore?.totalQuantity)
    expect(batch?.quantity).toBe(batchBefore?.quantity)
    expect(batch?.soldQuantity).toBe(batchBefore?.soldQuantity)
    expect(batch?.status).toBe(batchBefore?.status)

    expect(await returnInMovements()).toBe(movementsBefore)
    expect(await prisma.creditNote.count()).toBe(notesBefore)
    expect(await prisma.customerLedger.count()).toBe(ledgerBefore)

    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(customerAfter.outstandingBalance.toNumber()).toBe(500)

    const saleRow = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(saleRow.status).toBe('COMPLETED')
  })

  it('T8: invariant sweep — cap, sums, physical state, status and register invariants hold', async () => {
    // Plain partial return: cap + aggregate + physical invariants.
    const sale = await makeSale(fx, fx.plainProductId, 10)
    await createSaleReturn(
      {
        saleId: sale.id,
        reason: 'T8 partial',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: sale.itemIds[0],
            quantity: 7,
            restockDecision: 'RESTOCK',
            batchId: fx.plainBatchId,
          },
        ],
      },
      fx.branchAUser
    )

    const saleItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: sale.itemIds[0] } })
    expect(saleItem.returnedQuantity).toBeLessThanOrEqual(saleItem.quantity)
    expect(saleItem.returnedQuantity).toBe(7)

    const returnedSum = await prisma.saleReturnItem.aggregate({
      where: { saleItemId: sale.itemIds[0] },
      _sum: { quantity: true },
    })
    expect(returnedSum._sum.quantity).toBe(7)

    const inv = await inventoryFor(fx.plainProductId, fx.branchA)
    expect(inv?.availableQuantity).toBe(47)
    const batch = await batchById(fx.plainBatchId)
    expect(batch?.quantity).toBe(57)
    expect(batch?.soldQuantity).toBe(3)

    const saleRow = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(saleRow.status).toBe('PARTIALLY_RETURNED')
    expect(['COMPLETED', 'CANCELLED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED']).toContain(
      saleRow.status
    )

    // Narcotic RESTOCK return: register credit equals committed quantity, once.
    await seedOpening(fx, fx.narcoticProductId, fx.narcoticBatchId, 100)
    const narcSale = await makeSale(fx, fx.narcoticProductId, 10)
    const prevBalance = (await latestRegisterBalance(fx))?.balanceQuantity ?? 0
    await createSaleReturn(
      {
        saleId: narcSale.id,
        reason: 'T8 narcotic',
        refundMethod: 'CASH',
        items: [
          {
            saleItemId: narcSale.itemIds[0],
            quantity: 3,
            restockDecision: 'RESTOCK',
            batchId: fx.narcoticBatchId,
          },
        ],
      },
      fx.branchAUser
    )

    const narcItem = await prisma.saleItem.findUniqueOrThrow({ where: { id: narcSale.itemIds[0] } })
    expect(narcItem.returnedQuantity).toBe(3)

    const regRows = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE_RETURN' },
    })
    expect(regRows.length).toBe(1)
    expect(regRows[0].quantityIn).toBe(3)
    expect(regRows[0].balanceQuantity).toBe(prevBalance + 3)
  })
})
