/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Integration tests for H12 (GRN entity), H13 (over-receive guard),
// H14 (batch uniqueness relaxation + re-receipt merge).
//
// Skipped automatically when DATABASE_URL is not set.
// ─────────────────────────────────────────────────────────────
import { createGrn, listGrns } from '@/lib/purchases/purchase-service'
import prisma from '@/lib/db/prisma'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'goods_receipt_items',
  'goods_receipt_notes',
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
  'batch_status_log',
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
  productId: string
  purchase1Id: string
  purchase2Id: string
  pi1Id: string
  pi2Id: string
  pi3Id: string
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 86400000)
}

async function seed(): Promise<Fx> {
  const org = await prisma.organization.create({
    data: { name: 'Org', state: 'Maharashtra' },
  })
  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'Main',
      code: 'M',
      invoicePrefix: 'PO',
      state: 'Maharashtra',
    },
  })
  const user = await prisma.user.create({
    data: { name: 'Receiver', email: 'r@pharma.test', branchId: branch.id },
  })
  const supplier = await prisma.supplier.create({
    data: { name: 'Test Supplier', state: 'Maharashtra' },
  })

  const product = await prisma.product.create({
    data: {
      name: 'Paracetamol 500mg',
      sku: 'P-1',
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      createdById: user.id,
    },
  })

  // Two purchase orders so we can test cross-PO re-receipts.
  const purchase1 = await prisma.purchase.create({
    data: {
      purchaseNumber: 'PO-001',
      purchaseDate: new Date(),
      supplierId: supplier.id,
      branchId: branch.id,
      status: 'ORDERED',
      subtotal: 5000,
      taxAmount: 600,
      totalAmount: 5600,
      createdById: user.id,
    },
  })
  const purchase2 = await prisma.purchase.create({
    data: {
      purchaseNumber: 'PO-002',
      purchaseDate: new Date(),
      supplierId: supplier.id,
      branchId: branch.id,
      status: 'ORDERED',
      subtotal: 5000,
      taxAmount: 600,
      totalAmount: 5600,
      createdById: user.id,
    },
  })

  const pi1 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchase1.id,
      productId: product.id,
      orderedQuantity: 100,
      receivedQuantity: 0,
      unitCost: 50,
      mrp: 100,
      taxPercent: 12,
      taxAmount: 0,
      totalAmount: 5000,
    },
  })
  const pi2 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchase1.id,
      productId: product.id,
      orderedQuantity: 50,
      receivedQuantity: 0,
      unitCost: 50,
      mrp: 100,
      taxPercent: 12,
      taxAmount: 0,
      totalAmount: 2500,
    },
  })
  const pi3 = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchase2.id,
      productId: product.id,
      orderedQuantity: 100,
      receivedQuantity: 0,
      unitCost: 50,
      mrp: 100,
      taxPercent: 12,
      taxAmount: 0,
      totalAmount: 5000,
    },
  })

  await prisma.inventory.create({
    data: {
      productId: product.id,
      branchId: branch.id,
      totalQuantity: 0,
      availableQuantity: 0,
    },
  })

  return {
    actorId: user.id,
    branchId: branch.id,
    supplierId: supplier.id,
    productId: product.id,
    purchase1Id: purchase1.id,
    purchase2Id: purchase2.id,
    pi1Id: pi1.id,
    pi2Id: pi2.id,
    pi3Id: pi3.id,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('createGrn — H12 (entity), H13 (over-receive), H14 (re-receipt)', () => {
  let fx: Fx

  beforeAll(async () => {
    await resetDb()
    await seedSystemSettings()
    fx = await seed()
  }, 60_000)

  it('H12: creates a GoodsReceiptNote row (real entity)', async () => {
    await createGrn(
      {
        purchaseId: fx.purchase1Id,
        branchId: fx.branchId,
        grnNumber: 'GRN-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: fx.pi1Id,
            receivedQuantity: 60,
            batchNumber: 'BT-001',
            expiryDate: inDays(300),
            purchasePrice: 50,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      { id: fx.actorId, permissions: ['purchases:receive'] } as never
    )

    const grn = await prisma.goodsReceiptNote.findFirstOrThrow({
      where: { grnNumber: 'GRN-001', branchId: fx.branchId },
    })
    expect(grn.purchaseId).toBe(fx.purchase1Id)
    expect(grn.branchId).toBe(fx.branchId)

    const grnItems = await prisma.goodsReceiptItem.findMany({
      where: { goodsReceiptId: grn.id },
    })
    expect(grnItems).toHaveLength(1)
    expect(grnItems[0].receivedQuantity).toBe(60)
    expect(grnItems[0].batchNumber).toBe('BT-001')

    // listGrns surfaces the new GRN entity
    const list = await listGrns(
      { page: 1, limit: 10, sortBy: 'grnDate', sortOrder: 'desc' },
      { id: fx.actorId, permissions: ['purchases:read'] } as never
    )
    expect(list.data.length).toBeGreaterThanOrEqual(1)
    expect(list.data.find((g) => g.grnNumber === 'GRN-001')).toBeDefined()
  }, 30_000)

  it('H12: rejects a duplicate grnNumber within the same branch', async () => {
    await expect(
      createGrn(
        {
          purchaseId: fx.purchase1Id,
          branchId: fx.branchId,
          grnNumber: 'GRN-001', // already used above
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: fx.pi1Id,
              receivedQuantity: 10,
              batchNumber: 'BT-OTHER',
              expiryDate: inDays(300),
              purchasePrice: 50,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        { id: fx.actorId, permissions: ['purchases:receive'] } as never
      )
    ).rejects.toThrow(/already exists/)
  }, 30_000)

  it('H13: over-receive is blocked by the ceiling CAS (50 ordered, request 60)', async () => {
    // pi2 has orderedQuantity=50 and (probably) receivedQuantity=0.
    const pi2Before = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: fx.pi2Id } })
    expect(pi2Before.receivedQuantity).toBe(0)

    await expect(
      createGrn(
        {
          purchaseId: fx.purchase1Id,
          branchId: fx.branchId,
          grnNumber: 'GRN-OVER',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: fx.pi2Id,
              receivedQuantity: 60,
              batchNumber: 'BT-002',
              expiryDate: inDays(300),
              purchasePrice: 50,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        { id: fx.actorId, permissions: ['purchases:receive'] } as never
      )
    ).rejects.toThrow(/would be over-received/)

    // The increment must NOT have happened.
    const pi2After = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: fx.pi2Id } })
    expect(pi2After.receivedQuantity).toBe(0)
  }, 30_000)

  it('H14: re-receipt of the same batchNumber under the same PO increments the existing batch', async () => {
    // After the H12 test, batch BT-001 exists with quantity=60. Receive 40
    // more under the same PO with the same batch number — must merge.
    await createGrn(
      {
        purchaseId: fx.purchase1Id,
        branchId: fx.branchId,
        grnNumber: 'GRN-RERECEIPT-1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: fx.pi1Id,
            receivedQuantity: 40,
            batchNumber: 'BT-001', // same as the H12 test
            expiryDate: inDays(300),
            purchasePrice: 50,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      { id: fx.actorId, permissions: ['purchases:receive'] } as never
    )

    const batches = await prisma.batch.findMany({
      where: { productId: fx.productId, batchNumber: 'BT-001', purchaseId: fx.purchase1Id },
    })
    expect(batches).toHaveLength(1) // merged, not duplicated
    expect(batches[0].quantity).toBe(100) // 60 + 40

    // GoodsReceiptItem rows are still written per receipt (audit trail).
    const items = await prisma.goodsReceiptItem.findMany({
      where: { goodsReceipt: { grnNumber: 'GRN-RERECEIPT-1' } },
    })
    expect(items).toHaveLength(1)
    expect(items[0].receivedQuantity).toBe(40)
  }, 30_000)

  it('H14: the same batchNumber under a DIFFERENT PO is allowed (own Batch row)', async () => {
    await createGrn(
      {
        purchaseId: fx.purchase2Id,
        branchId: fx.branchId,
        grnNumber: 'GRN-PO2',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: fx.pi3Id,
            receivedQuantity: 25,
            batchNumber: 'BT-001', // same batchNumber, different PO
            expiryDate: inDays(300),
            purchasePrice: 50,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      { id: fx.actorId, permissions: ['purchases:receive'] } as never
    )

    const batches = await prisma.batch.findMany({
      where: { productId: fx.productId, batchNumber: 'BT-001' },
      orderBy: { purchaseId: 'asc' },
    })
    // Two batches: one tied to PO-001 (qty 100) and one tied to PO-002 (qty 25)
    expect(batches).toHaveLength(2)
    const byPo = new Map(batches.map((b) => [b.purchaseId, b.quantity]))
    expect(byPo.get(fx.purchase1Id)).toBe(100)
    expect(byPo.get(fx.purchase2Id)).toBe(25)
  }, 30_000)
})
