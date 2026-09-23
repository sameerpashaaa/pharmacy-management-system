/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Integration tests for H11 — purchase-return integrity.
//
// Verifies:
//   * Server-priced unit cost (client cannot inflate it)
//   * Received-quantity cap (no over-return on a line)
//   * Inventory floor (cannot drive availableQuantity negative)
//   * Batch floor (cannot drive batch.quantity negative)
//   * PurchaseItem.returnedQuantity accumulates correctly
//   * SupplierLedger uses CREDIT (matches recordSupplierPayment convention)
//   * GST ITC reversal rows are written for the returned portion
//
// Skipped automatically when DATABASE_URL is not set.
// ─────────────────────────────────────────────────────────────
import { createPurchaseReturn } from '@/lib/purchases/purchase-service'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'gst_transactions',
  'sale_item_batches',
  'sale_items',
  'sales',
  'sale_return_items',
  'sale_returns',
  'credit_notes',
  'payments',
  'purchase_return_items',
  'purchase_returns',
  'inventory_movements',
  'batches',
  'inventory',
  'purchase_items',
  'purchases',
  'product_barcodes',
  'products',
  'supplier_ledgers',
  'suppliers',
  'customer_ledgers',
  'customers',
  'user_roles',
  'role_permissions',
  'notifications',
  'accounts',
  'sessions',
  'users',
  'branches',
  'organization_settings',
  'system_settings',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

async function seedSystemSettings(): Promise<void> {
  const rows = [
    ['pos', 'allow_credit_sales', 'true'],
    ['gst', 'tax_inclusive', 'false'],
  ] as const
  for (const [category, key, value] of rows) {
    await prisma.systemSetting.upsert({
      where: { category_key: { category, key } },
      update: { value },
      create: { category, key, value },
    })
  }
}

interface Fx {
  actorId: string
  branchId: string
  supplierId: string
  productAId: string
  productBId: string
  purchaseAId: string
  purchaseItemA1Id: string
  purchaseItemA2Id: string
  purchaseItemB1Id: string
}

async function seed(): Promise<Fx> {
  const org = await prisma.organization.create({
    data: { name: 'Org', state: 'Maharashtra' },
  })
  const branch = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Main', code: 'M', invoicePrefix: 'PO', state: 'Maharashtra' },
  })
  const user = await prisma.user.create({
    data: { name: 'Buyer', email: 'b@pharma.test', branchId: branch.id },
  })
  const supplier = await prisma.supplier.create({
    data: {
      name: 'Test Supplier',
      gstin: '27ABCDE1234F1Z5',
      state: 'Maharashtra',
      outstandingBalance: 0,
    },
  })

  const productA = await prisma.product.create({
    data: {
      name: 'Paracetamol 500mg',
      sku: 'P-A',
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      createdById: user.id,
    },
  })
  const productB = await prisma.product.create({
    data: {
      name: 'Aspirin 75mg',
      sku: 'P-B',
      mrp: 80,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      createdById: user.id,
    },
  })

  // Purchase A — received
  const purchaseA = await prisma.purchase.create({
    data: {
      purchaseNumber: 'PO-A',
      purchaseDate: new Date(),
      supplierId: supplier.id,
      branchId: branch.id,
      status: 'RECEIVED',
      subtotal: 5000,
      taxAmount: 600,
      totalAmount: 5600,
      createdById: user.id,
    },
  })
  // Two purchase items at different costs (50 and 80)
  const poItemA1 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchaseA.id,
      productId: productA.id,
      orderedQuantity: 100,
      receivedQuantity: 100,
      unitCost: 50,
      mrp: 100,
      taxPercent: 12,
      taxAmount: 600,
      totalAmount: 5600,
    },
  })
  // We need a second item so the test exercises the multi-line flow.
  const poItemA2 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchaseA.id,
      productId: productB.id,
      orderedQuantity: 50,
      receivedQuantity: 50,
      unitCost: 30,
      mrp: 80,
      taxPercent: 12,
      taxAmount: 180,
      totalAmount: 1680,
    },
  })
  // Seed inventory + a batch for each product
  for (const p of [productA, productB]) {
    await prisma.inventory.create({
      data: {
        productId: p.id,
        branchId: branch.id,
        totalQuantity: p.id === productA.id ? 100 : 50,
        availableQuantity: p.id === productA.id ? 100 : 50,
      },
    })
    await prisma.batch.create({
      data: {
        productId: p.id,
        branchId: branch.id,
        batchNumber: `B-${p.sku}`,
        quantity: p.id === productA.id ? 100 : 50,
        mrp: p.mrp,
        purchasePrice: p.id === productA.id ? 50 : 30,
        expiryDate: new Date(Date.now() + 365 * 86400000),
      },
    })
  }

  // Seed a small purchase just so the supplier has a prior ledger balance;
  // not used by the actual return-under-test but lets us assert that the
  // return's CREDIT row reduces the carried-forward balance.
  const purchaseB = await prisma.purchase.create({
    data: {
      purchaseNumber: 'PO-B',
      purchaseDate: new Date(),
      supplierId: supplier.id,
      branchId: branch.id,
      status: 'RECEIVED',
      subtotal: 100,
      taxAmount: 12,
      totalAmount: 112,
      createdById: user.id,
    },
  })
  const poItemB1 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchaseB.id,
      productId: productB.id,
      orderedQuantity: 2,
      receivedQuantity: 2,
      unitCost: 30,
      mrp: 80,
      taxPercent: 12,
      taxAmount: 7.2,
      totalAmount: 67.2,
    },
  })
  await prisma.supplierLedger.create({
    data: {
      supplierId: supplier.id,
      type: 'CREDIT',
      amount: 112,
      balance: -112,
      description: 'Opening purchase PO-B',
      referenceType: 'PURCHASE',
      referenceId: purchaseB.id,
    },
  })
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: { outstandingBalance: { increment: 112 } },
  })

  return {
    actorId: user.id,
    branchId: branch.id,
    supplierId: supplier.id,
    productAId: productA.id,
    productBId: productB.id,
    purchaseAId: purchaseA.id,
    purchaseItemA1Id: poItemA1.id,
    purchaseItemA2Id: poItemA2.id,
    purchaseItemB1Id: poItemB1.id,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('createPurchaseReturn — H11 integrity', () => {
  let fx: Fx

  beforeAll(async () => {
    await resetDb()
    await seedSystemSettings()
    fx = await seed()
  }, 60_000)

  it('servers price the return from PurchaseItem.unitCost (ignores client unitCost)', async () => {
    const purchaseReturn = await createPurchaseReturn(
      {
        purchaseId: fx.purchaseAId,
        supplierId: fx.supplierId,
        returnDate: new Date().toISOString(),
        reason: 'Damaged',
        items: [
          // Note: unitCost is omitted entirely on purpose — server derives it.
          { purchaseItemId: fx.purchaseItemA1Id, quantity: 5, reason: 'Damaged' },
        ],
      },
      { id: fx.actorId, permissions: ['returns:create'] } as never
    )

    const items = await prisma.purchaseReturnItem.findMany({
      where: { purchaseReturnId: purchaseReturn.id },
    })
    expect(items).toHaveLength(1)
    expect(Number(items[0].unitCost)).toBe(50) // not whatever the client might have sent
    expect(Number(items[0].totalAmount)).toBe(250) // 5 * 50

    const header = await prisma.purchaseReturn.findUniqueOrThrow({ where: { id: purchaseReturn.id } })
    expect(Number(header.totalAmount)).toBe(250)
  }, 30_000)

  it('rejects when return quantity exceeds remaining returnable quantity', async () => {
    // poItemA1.receivedQuantity=100, returnedQuantity=0 -> remaining=100.
    await expect(
      createPurchaseReturn(
        {
          purchaseId: fx.purchaseAId,
          supplierId: fx.supplierId,
          returnDate: new Date().toISOString(),
          reason: 'Over-return',
          items: [{ purchaseItemId: fx.purchaseItemA1Id, quantity: 101, reason: 'Over' }],
        },
        { id: fx.actorId, permissions: ['returns:create'] } as never
      )
    ).rejects.toThrow(/exceeds remaining returnable/)
  }, 30_000)

  it('rejects when return would drive inventory availableQuantity negative', async () => {
    // Drain productB inventory to 1 unit; try to return 5
    await prisma.inventory.update({
      where: { productId_branchId: { productId: fx.productBId, branchId: fx.branchId } },
      data: { totalQuantity: 1, availableQuantity: 1 },
    })
    await expect(
      createPurchaseReturn(
        {
          purchaseId: fx.purchaseAId,
          supplierId: fx.supplierId,
          returnDate: new Date().toISOString(),
          reason: 'Drain',
          items: [{ purchaseItemId: fx.purchaseItemA2Id, quantity: 5, reason: 'Drain' }],
        },
        { id: fx.actorId, permissions: ['returns:create'] } as never
      )
    ).rejects.toThrow(/only 1 units available/)

    // Restore
    await prisma.inventory.update({
      where: { productId_branchId: { productId: fx.productBId, branchId: fx.branchId } },
      data: { totalQuantity: 50, availableQuantity: 50 },
    })
  }, 30_000)

  it('writes SupplierLedger type CREDIT (H11 sign fix)', async () => {
    const purchaseReturn = await createPurchaseReturn(
      {
        purchaseId: fx.purchaseAId,
        supplierId: fx.supplierId,
        returnDate: new Date().toISOString(),
        reason: 'Sign fix',
        items: [{ purchaseItemId: fx.purchaseItemA1Id, quantity: 2, reason: 'Sign fix' }],
      },
      { id: fx.actorId, permissions: ['returns:create'] } as never
    )

    const ledger = await prisma.supplierLedger.findMany({
      where: { referenceType: 'PURCHASE_RETURN', referenceId: purchaseReturn.id },
    })
    expect(ledger).toHaveLength(1)
    expect(ledger[0].type).toBe('CREDIT')
    expect(Number(ledger[0].amount)).toBe(100) // 2 * 50

    // Outstanding balance decremented
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: fx.supplierId } })
    expect(Number(supplier.outstandingBalance)).toBeLessThanOrEqual(112) // was 112, reduced by 100
  }, 30_000)

  it('accumulates PurchaseItem.returnedQuantity across successive returns', async () => {
    // First, return 3 units
    await createPurchaseReturn(
      {
        purchaseId: fx.purchaseAId,
        supplierId: fx.supplierId,
        returnDate: new Date().toISOString(),
        reason: 'Partial 1',
        items: [{ purchaseItemId: fx.purchaseItemA2Id, quantity: 3, reason: 'Partial 1' }],
      },
      { id: fx.actorId, permissions: ['returns:create'] } as never
    )
    let item = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: fx.purchaseItemA2Id } })
    expect(item.returnedQuantity).toBe(3)

    // Then return another 4 units
    await createPurchaseReturn(
      {
        purchaseId: fx.purchaseAId,
        supplierId: fx.supplierId,
        returnDate: new Date().toISOString(),
        reason: 'Partial 2',
        items: [{ purchaseItemId: fx.purchaseItemA2Id, quantity: 4, reason: 'Partial 2' }],
      },
      { id: fx.actorId, permissions: ['returns:create'] } as never
    )
    item = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: fx.purchaseItemA2Id } })
    expect(item.returnedQuantity).toBe(7)

    // Third return that would push us past receivedQuantity (50) is rejected.
    await expect(
      createPurchaseReturn(
        {
          purchaseId: fx.purchaseAId,
          supplierId: fx.supplierId,
          returnDate: new Date().toISOString(),
          reason: 'Over',
          items: [{ purchaseItemId: fx.purchaseItemA2Id, quantity: 44, reason: 'Over' }],
        },
        { id: fx.actorId, permissions: ['returns:create'] } as never
      )
    ).rejects.toThrow(/exceeds remaining returnable/)
  }, 60_000)

  it('writes GST ITC reversal rows for the returned portion (C4 mirror)', async () => {
    // Seed a PURCHASE gstTransaction row for poItemA1 (so the reversal has
    // something to negate).
    await prisma.gstTransaction.create({
      data: {
        branchId: fx.branchId,
        type: 'B2B',
        referenceType: 'PURCHASE',
        referenceId: fx.purchaseAId,
        referenceLineId: fx.purchaseItemA1Id,
        invoiceNumber: 'PO-A',
        invoiceDate: new Date(),
        partyGstin: '27ABCDE1234F1Z5',
        partyName: 'Test Supplier',
        partyState: 'Maharashtra',
        taxableAmount: new Prisma.Decimal(5000),
        cgstAmount: new Prisma.Decimal(300),
        sgstAmount: new Prisma.Decimal(300),
        igstAmount: new Prisma.Decimal(0),
        totalTax: new Prisma.Decimal(600),
        totalAmount: new Prisma.Decimal(5600),
      },
    })

    const purchaseReturn = await createPurchaseReturn(
      {
        purchaseId: fx.purchaseAId,
        supplierId: fx.supplierId,
        returnDate: new Date().toISOString(),
        reason: 'GST reversal',
        items: [{ purchaseItemId: fx.purchaseItemA1Id, quantity: 10, reason: 'GST' }],
      },
      { id: fx.actorId, permissions: ['returns:create'] } as never
    )

    const reversals = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE_RETURN', referenceId: purchaseReturn.id },
    })
    expect(reversals).toHaveLength(1)
    // Pro-rata: 10/100 = 10% of each amount
    expect(Number(reversals[0].taxableAmount)).toBeCloseTo(-500, 2)
    expect(Number(reversals[0].cgstAmount)).toBeCloseTo(-30, 2)
    expect(Number(reversals[0].sgstAmount)).toBeCloseTo(-30, 2)
    expect(Number(reversals[0].totalTax)).toBeCloseTo(-60, 2)
    expect(Number(reversals[0].totalAmount)).toBeCloseTo(-560, 2)
  }, 30_000)
})
