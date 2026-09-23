/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Purchase Management — Real-Postgres integration tests.
//
// These run against the dedicated local test container when
// DATABASE_URL is set (jest.setup.ts defaults it to the `pharma_test`
// schema on localhost:5435). The suite skips itself when no DB is
// configured so the unit suite can run offline anywhere.
//
// Coverage: supplier CRUD, PO lifecycle, GRN (batch/inventory/IN
// movement/audit), over-receiving and expiry guards, duplicate batch
// protection, ±2% three-way matching, supplier payments + ledger,
// purchase returns + inventory reversal, and branch/org isolation.
// ─────────────────────────────────────────────────────────────
import { NarcoticMovementType } from '@prisma/client'

import { POST as purchaseReturnsPOST } from '@/app/api/purchase-returns/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { filterEligibleBatches } from '@/lib/batches/fefo'
import prisma from '@/lib/db/prisma'
import type { AuthUser } from '@/lib/inventory/branch-access'
import {
  createGrn,
  createPurchase,
  createPurchaseReturn,
  createSupplier,
  getPurchase,
  getPurchaseReturn,
  getSupplier,
  listGrns,
  listPurchaseReturns,
  listPurchases,
  listSuppliers,
  recordSupplierPayment,
  threeWayMatch,
  updatePurchase,
  updateSupplier,
  type CreatePurchaseCommand,
} from '@/lib/purchases/purchase-service'
import { createSupplierSchema } from '@/lib/validations/purchase'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ─── Fixture state ────────────────────────────────────────────

interface Fixtures {
  globalActor: AuthUser
  branchAUser: AuthUser
  branchBUser: AuthUser
  otherOrgUser: AuthUser
  branchA: string
  branchB: string
  branchC: string
  org1: string
  org2: string
  para: string
  aspirin: string
  supplierId: string
  supplier2Id: string
  userAId: string
  userBId: string
  userOtherId: string
}

// Sales-table list (existing suite) + the purchase-related tables so
// every phase-4 record is reset between cases.
const TBLS = [
  'audit_logs',
  'batch_status_log',
  'batch_disposals',
  'sale_item_batches',
  'sale_items',
  'sales',
  'sale_return_items',
  'sale_returns',
  'credit_notes',
  'payments',
  'held_bills',
  'inventory_movements',
  'stock_adjustments',
  'supplier_ledgers',
  'suppliers',
  'purchase_return_items',
  'purchase_returns',
  'purchase_items',
  'purchases',
  'narcotic_register',
  'batches',
  'inventory',
  'product_barcodes',
  'products',
  'customer_ledgers',
  'customers',
  'prescription_images',
  'prescriptions',
  'user_roles',
  'role_permissions',
  'password_reset_tokens',
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
    ['pos', 'max_discount_percent', '20'],
    ['pos', 'round_off_total', 'true'],
    ['pos', 'allow_credit_sales', 'true'],
    ['pos', 'require_customer_for_credit', 'true'],
    ['inventory', 'fefo_enabled', 'true'],
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

async function seedFixtures(): Promise<Fixtures> {
  const org1 = await prisma.organization.create({ data: { name: 'Org One' } })
  const org2 = await prisma.organization.create({ data: { name: 'Org Two' } })

  const branchA = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch A', code: 'A', invoicePrefix: 'INV' },
  })
  const branchB = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch B', code: 'B', invoicePrefix: 'INV' },
  })
  const branchC = await prisma.branch.create({
    data: { organizationId: org2.id, name: 'Branch C', code: 'C', invoicePrefix: 'INV' },
  })

  const userA = await prisma.user.create({
    data: { name: 'Alok', email: 'alok@pharma.test', branchId: branchA.id },
  })
  const userB = await prisma.user.create({
    data: { name: 'Bina', email: 'bina@pharma.test', branchId: branchB.id },
  })
  const userOther = await prisma.user.create({
    data: { name: 'Chand', email: 'chand@pharma.test', branchId: branchC.id },
  })

  const para = await prisma.product.create({
    data: {
      name: 'Paracetamol 500',
      sku: 'P-001',
      barcode: '89010001',
      mrp: 100,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })
  const aspirin = await prisma.product.create({
    data: {
      name: 'Aspirin 100',
      sku: 'P-002',
      barcode: '89010002',
      mrp: 10.5,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })

  const supplierA = await prisma.supplier.create({
    data: { name: 'Medicare Distributors', creditDays: 30, outstandingBalance: 0, isActive: true },
  })
  const supplierB = await prisma.supplier.create({
    data: { name: 'Zenith Pharma', creditDays: 60, outstandingBalance: 0, isActive: true },
  })

  return {
    globalActor: { id: userA.id, branchId: null },
    branchAUser: { id: userA.id, branchId: branchA.id },
    branchBUser: { id: userB.id, branchId: branchB.id },
    otherOrgUser: { id: userOther.id, branchId: branchC.id },
    branchA: branchA.id,
    branchB: branchB.id,
    branchC: branchC.id,
    org1: org1.id,
    org2: org2.id,
    para: para.id,
    aspirin: aspirin.id,
    supplierId: supplierA.id,
    supplier2Id: supplierB.id,
    userAId: userA.id,
    userBId: userB.id,
    userOtherId: userOther.id,
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Date `days` days from now (for expiry-window assertions). */
function inDays(days: number): Date {
  return new Date(Date.now() + days * 86400000)
}

function poCommand(
  fx: Fixtures,
  overrides: Partial<CreatePurchaseCommand> = {}
): CreatePurchaseCommand {
  return {
    branchId: fx.branchA,
    supplierId: fx.supplierId,
    items: [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10, discountPercent: 0, taxPercent: 0 },
    ],
    ...overrides,
  }
}

async function orderPurchase(
  fx: Fixtures,
  overrides: Partial<CreatePurchaseCommand> = {}
): Promise<{ id: string; itemId: string }> {
  const purchase = await createPurchase(poCommand(fx, overrides), fx.branchAUser)
  await updatePurchase(purchase.id, { status: 'ORDERED' }, fx.branchAUser)
  const item = purchase.items[0]
  return { id: purchase.id, itemId: item.id }
}

async function inventoryFor(productId: string, branchId: string) {
  return prisma.inventory.findUnique({ where: { productId_branchId: { productId, branchId } } })
}

// ─── Tests ────────────────────────────────────────────────────

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Purchase management integration (real Postgres)', () => {
  let fx: Fixtures

  beforeAll(async () => {
    await resetDb()
    await seedSystemSettings()
  })

  beforeEach(async () => {
    await resetDb()
    await seedSystemSettings()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await resetDb()
    await prisma.$disconnect()
  })

  // ── Suppliers ──────────────────────────────────────────────

  it('creates a supplier with defaults and an audit trail', async () => {
    const supplier = await createSupplier(
      { name: 'Fresh Suppliers', email: 'sales@fresh.example', creditDays: 45 },
      fx.globalActor
    )

    expect(supplier.name).toBe('Fresh Suppliers')
    expect(supplier.creditDays).toBe(45)
    expect(supplier.outstandingBalance.toNumber()).toBe(0)
    expect(supplier.isActive).toBe(true)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUPPLIER_CREATE', entity: 'Supplier' },
    })
    expect(audit?.entityId).toBe(supplier.id)
    expect(audit?.userId).toBe(fx.userAId)
    expect(audit?.metadata).toMatchObject({ name: 'Fresh Suppliers' })
  })

  it('defaults creditDays to 30 when omitted', async () => {
    const supplier = await createSupplier(
      createSupplierSchema.parse({ name: 'No Terms' }),
      fx.globalActor
    )
    expect(supplier.creditDays).toBe(30)
  })

  it('updates a supplier and writes SUPPLIER_UPDATE audit', async () => {
    const supplier = await createSupplier(
      createSupplierSchema.parse({ name: 'Update Me' }),
      fx.globalActor
    )
    const updated = await updateSupplier(
      supplier.id,
      { creditDays: 90, address: 'Mumbai' },
      fx.globalActor
    )
    expect(updated.creditDays).toBe(90)
    expect(updated.address).toBe('Mumbai')

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUPPLIER_UPDATE', entity: 'Supplier', entityId: supplier.id },
    })
    expect(audit).not.toBeNull()
  })

  it('lists and searches suppliers with pagination', async () => {
    await createSupplier({ name: 'Alpha Meds', creditDays: 30 }, fx.globalActor)
    await createSupplier({ name: 'Beta Chemist', creditDays: 30 }, fx.globalActor)

    const all = await listSuppliers(
      { page: 1, limit: 10, sortBy: 'name', sortOrder: 'asc' },
      fx.globalActor
    )
    expect(all.pagination.total).toBe(4) // 2 fixtures + 2 created
    expect(all.pagination.pages).toBe(1)

    const searched = await listSuppliers(
      { search: 'Alpha', page: 1, limit: 10, sortBy: 'name', sortOrder: 'asc' },
      fx.globalActor
    )
    expect(searched.data).toHaveLength(1)
    expect(searched.data[0].name).toBe('Alpha Meds')
  })

  // ── Purchase orders ────────────────────────────────────────

  it('creates a DRAFT purchase order with server-side line items', async () => {
    const purchase = await createPurchase(poCommand(fx), fx.branchAUser)

    expect(purchase.branchId).toBe(fx.branchA)
    expect(purchase.supplierId).toBe(fx.supplierId)
    expect(purchase.status).toBe('DRAFT')
    expect(purchase.purchaseNumber).toMatch(/^PO-\d+$/)
    expect(purchase.items).toHaveLength(1)
    expect(purchase.items[0].orderedQuantity).toBe(100)
    expect(purchase.items[0].receivedQuantity).toBe(0)
    // Server-side calculated: 100 * 10 * (1 - 0/100) * (1 + 0/100) = 1000
    expect(purchase.items[0].totalAmount.toNumber()).toBe(1000)
    // MRP derived from product master
    expect(purchase.items[0].mrp.toNumber()).toBe(100)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PURCHASE_CREATE', entity: 'Purchase' },
    })
    expect(audit?.entityId).toBe(purchase.id)
    expect(audit?.metadata).toMatchObject({
      purchaseNumber: purchase.purchaseNumber,
      supplierId: purchase.supplierId,
    })
  })

  it('rejects an inactive supplier, an inactive product, and a missing product', async () => {
    await prisma.supplier.update({ where: { id: fx.supplierId }, data: { isActive: false } })
    await expect(createPurchase(poCommand(fx), fx.branchAUser)).rejects.toThrow(
      'Supplier is inactive'
    )

    await prisma.supplier.update({ where: { id: fx.supplierId }, data: { isActive: true } })
    await prisma.product.update({ where: { id: fx.para }, data: { isActive: false } })
    await expect(createPurchase(poCommand(fx), fx.branchAUser)).rejects.toThrow(
      'Product is inactive: Paracetamol 500'
    )

    await prisma.product.update({ where: { id: fx.para }, data: { isActive: true } })
    await expect(
      createPurchase(
        poCommand(fx, {
          items: [
            {
              productId: 'no-such-product',
              orderedQuantity: 1,
              unitCost: 1,
              discountPercent: 0,
              taxPercent: 0,
            },
          ],
        }),
        fx.branchAUser
      )
    ).rejects.toThrow('Not Found: product no-such-product')
  })

  it('enforces the PO status transition table', async () => {
    const purchase = await createPurchase(poCommand(fx), fx.branchAUser)

    await expect(
      updatePurchase(purchase.id, { status: 'RECEIVED' as never }, fx.branchAUser)
    ).rejects.toThrow('Invalid status transition')

    const ordered = await updatePurchase(purchase.id, { status: 'ORDERED' }, fx.branchAUser)
    expect(ordered.status).toBe('ORDERED')

    // ORDERED cannot jump to RECEIVED by status update (GRN is the way in).
    await expect(
      updatePurchase(purchase.id, { status: 'INVOICED' as never }, fx.branchAUser)
    ).rejects.toThrow('Invalid status transition')
  })

  // ── GRN ────────────────────────────────────────────────────

  it('receives a full GRN: batch, inventory, IN movement, audit, RECEIVED', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    const grnDate = new Date()
    const result = await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-001',
        grnDate,
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-MED-1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    // The returned purchase now reflects the COMMITTED state (RECEIVED)
    // not the mid-transaction PARTIALLY_RECEIVED state
    expect(result.purchase.status).toBe('RECEIVED')

    const committed = await getPurchase(purchaseId, fx.globalActor)
    expect(committed?.status).toBe('RECEIVED')
    expect(committed?.receivedAt?.toISOString().slice(0, 19)).toBe(
      grnDate.toISOString().slice(0, 19)
    )

    const batch = await prisma.batch.findUnique({
      where: { productId_batchNumber: { productId: fx.para, batchNumber: 'BT-MED-1' } },
    })
    expect(batch).not.toBeNull()
    expect(batch?.quantity).toBe(100)
    expect(batch?.status).toBe('ACTIVE')
    expect(batch?.branchId).toBe(fx.branchA)
    expect(batch?.purchaseId).toBe(purchaseId)
    expect(batch?.soldQuantity).toBe(0)

    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(100)
    expect(inv?.availableQuantity).toBe(100)

    const movement = await prisma.inventoryMovement.findFirst({ where: { type: 'IN' } })
    expect(movement?.referenceType).toBe('GRN')
    expect(movement?.quantity).toBe(100)
    expect(movement?.quantityBefore).toBe(0)
    expect(movement?.quantityAfter).toBe(100)
    expect(movement?.batchId).toBe(batch?.id)
    expect(movement?.createdById).toBe(fx.userAId)

    const item = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(item?.receivedQuantity).toBe(100)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'GRN_CREATE', entity: 'Purchase' },
    })
    expect(audit?.entityId).toBe(purchaseId)
    expect(audit?.metadata).toMatchObject({ grnNumber: 'GRN-001', purchaseId })

    const log = await prisma.batchStatusLog.findFirst({ where: { batchId: batch?.id } })
    expect(log?.fromStatus).toBe('ACTIVE')
    expect(log?.toStatus).toBe('ACTIVE')
  })

  it('keeps the PO PARTIALLY_RECEIVED until it is fully received', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-002',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 40,
            batchNumber: 'BT-PART-1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    const mid = await getPurchase(purchaseId, fx.globalActor)
    expect(mid?.status).toBe('PARTIALLY_RECEIVED')
    expect(mid?.items[0].receivedQuantity).toBe(40)
    const invMid = await inventoryFor(fx.para, fx.branchA)
    expect(invMid?.totalQuantity).toBe(40)

    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-003',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 60,
            batchNumber: 'BT-PART-2',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    const done = await getPurchase(purchaseId, fx.globalActor)
    expect(done?.status).toBe('RECEIVED')
    expect(done?.items[0].receivedQuantity).toBe(100)
    const invDone = await inventoryFor(fx.para, fx.branchA)
    expect(invDone?.totalQuantity).toBe(100)
  })

  it('rejects over-receiving against the remaining quantity', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchA,
          grnNumber: 'GRN-004',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 101,
              batchNumber: 'BT-OVER',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Over-receiving')

    expect(await prisma.batch.count()).toBe(0)
    expect(await prisma.inventoryMovement.count()).toBe(0)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv).toBeNull()
  })

  it('rejects receiving goods that expire within six months', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchA,
          grnNumber: 'GRN-005',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 10,
              batchNumber: 'BT-SOON',
              expiryDate: inDays(150),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Expiry date too soon')
  })

  it('rejects receiving against a purchase that is not orderable', async () => {
    const purchase = await createPurchase(poCommand(fx), fx.branchAUser) // still DRAFT

    await expect(
      createGrn(
        {
          purchaseId: purchase.id,
          branchId: fx.branchA,
          grnNumber: 'GRN-006',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: purchase.items[0].id,
              receivedQuantity: 10,
              batchNumber: 'BT-DRAFT',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Cannot receive against purchase in status: DRAFT')
  })

  it('rejects duplicate batch numbers within a single GRN', async () => {
    const purchase = await createPurchase(
      poCommand(fx, {
        items: [
          {
            productId: fx.para,
            orderedQuantity: 50,
            unitCost: 10,
            discountPercent: 0,
            taxPercent: 0,
          },
          {
            productId: fx.aspirin,
            orderedQuantity: 50,
            unitCost: 5,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      }),
      fx.branchAUser
    )
    await updatePurchase(purchase.id, { status: 'ORDERED' }, fx.branchAUser)
    const [itemA, itemB] = purchase.items

    await expect(
      createGrn(
        {
          purchaseId: purchase.id,
          branchId: fx.branchA,
          grnNumber: 'GRN-007',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemA.id,
              receivedQuantity: 10,
              batchNumber: 'BT-SAME',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
            {
              purchaseItemId: itemB.id,
              receivedQuantity: 10,
              batchNumber: 'BT-SAME',
              expiryDate: inDays(300),
              purchasePrice: 5,
              mrp: 10.5,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Duplicate batch numbers within GRN')
  })

  it('rejects a duplicate product/batch across GRNs and rolls back atomically', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-008',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 50,
            batchNumber: 'BT-DUP',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchA,
          grnNumber: 'GRN-009',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 50,
              batchNumber: 'BT-DUP',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow(/Unique constraint|batch/i)

    // First GRN persisted; second fully rolled back.
    expect(await prisma.batch.count()).toBe(1)
    const item = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(item?.receivedQuantity).toBe(50)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(50)
    expect(await prisma.inventoryMovement.count()).toBe(1)
  })

  it('rejects over-receiving after a prior partial receipt (remaining guard)', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-PART1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 40,
            batchNumber: 'BT-PART-3',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchA,
          grnNumber: 'GRN-PART2',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 61,
              batchNumber: 'BT-PART-4',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Over-receiving')

    // Nothing from the rejected receipt persisted.
    expect(await prisma.batch.count()).toBe(1)
    const item = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(item?.receivedQuantity).toBe(40)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(40)
    expect(await prisma.inventoryMovement.count()).toBe(1)
  })

  // ── Three-way matching ─────────────────────────────────────

  it('matches a PO/GRN/invoice within the ±2% tolerance', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-M1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-M1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    // totalAmount and mrp are now calculated server-side at PO creation
    // No manual patch needed - threeWayMatch uses the authoritative PO amounts

    const result = await threeWayMatch(
      {
        purchaseId,
        invoiceNumber: 'INV-1001',
        items: [
          {
            purchaseItemId: itemId,
            invoiceQuantity: 100,
            invoiceAmount: 1000,
            tolerancePercent: 2,
          },
        ],
      },
      fx.globalActor
    )

    expect(result.status).toBe('MATCHED')
    expect(result.mismatches).toHaveLength(0)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'THREE_WAY_MATCH', entity: 'Purchase' },
    })
    expect(audit?.entityId).toBe(purchaseId)
    expect(audit?.metadata).toMatchObject({ status: 'MATCHED', mismatchCount: 0 })
  })

  it('flags quantity and amount outside the ±2% tolerance with real mismatch details', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-M2',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-M2',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    const result = await threeWayMatch(
      {
        purchaseId,
        invoiceNumber: 'INV-1002',
        items: [
          {
            purchaseItemId: itemId,
            invoiceQuantity: 110, // +10% vs 100 received
            invoiceAmount: 1100, // +10% vs 1000 PO amount
            tolerancePercent: 2,
          },
        ],
      },
      fx.globalActor
    )

    expect(result.status).toBe('MISMATCHED')

    const qtyMis = result.mismatches.find((m) => m.field === 'quantity')
    expect(qtyMis?.poValue).toBe(100)
    expect(qtyMis?.invoiceValue).toBe(110)
    expect(qtyMis?.variance).toBe(10)
    expect(qtyMis?.variancePercent).toBe(10)

    const amtMis = result.mismatches.find((m) => m.field === 'amount')
    expect(amtMis?.poValue).toBe(1000)
    expect(amtMis?.invoiceValue).toBe(1100)
    expect(amtMis?.variance).toBe(100)
    expect(amtMis?.variancePercent).toBe(10)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'THREE_WAY_MATCH', entity: 'Purchase', entityId: purchaseId },
    })
    expect(audit?.metadata).toMatchObject({ status: 'MISMATCHED', mismatchCount: 2 })
  })

  it('is a real calculation, not a hardcoded answer (boundary at 2%)', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-M3',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-M3',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    const atTolerance = await threeWayMatch(
      {
        purchaseId,
        invoiceNumber: 'INV-1003',
        items: [
          {
            purchaseItemId: itemId,
            invoiceQuantity: 102,
            invoiceAmount: 1020,
            tolerancePercent: 2,
          },
        ],
      },
      fx.globalActor
    )
    expect(atTolerance.status).toBe('MATCHED')

    const overTolerance = await threeWayMatch(
      {
        purchaseId,
        invoiceNumber: 'INV-1004',
        items: [
          {
            purchaseItemId: itemId,
            invoiceQuantity: 103,
            invoiceAmount: 1021,
            tolerancePercent: 2,
          },
        ],
      },
      fx.globalActor
    )
    expect(overTolerance.status).toBe('MISMATCHED')
    expect(overTolerance.mismatches.map((m) => m.field).sort()).toEqual(['amount', 'quantity'])
  })

  // ── Supplier payments ──────────────────────────────────────

  it('records a supplier payment, updates the ledger, and reduces outstanding', async () => {
    const { payment, ledgerEntry } = await recordSupplierPayment(
      {
        supplierId: fx.supplierId,
        amount: 500,
        paymentDate: new Date().toISOString(),
        method: 'CASH',
        reference: 'ref-cash-1',
        notes: 'Settlement for GRN-001',
      },
      fx.globalActor
    )

    const paid = await prisma.payment.findFirst({ where: { id: payment.id } })
    expect(paid?.supplierId).toBe(fx.supplierId)
    expect(paid?.method).toBe('CASH')
    expect(paid?.amount.toNumber()).toBe(500)
    expect(paid?.reference).toBe('ref-cash-1')

    const ledger = await prisma.supplierLedger.findFirst({ where: { id: ledgerEntry.id } })
    expect(ledger?.type).toBe('CREDIT')
    expect(ledger?.amount.toNumber()).toBe(500)
    expect(ledger?.balance.toNumber()).toBe(-500)
    expect(ledger?.description).toContain('ref-cash-1')

    const supplier = await prisma.supplier.findUnique({ where: { id: fx.supplierId } })
    expect(supplier?.outstandingBalance.toNumber()).toBe(-500)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUPPLIER_PAYMENT', entity: 'Supplier' },
    })
    expect(audit?.entityId).toBe(fx.supplierId)
    expect(audit?.metadata).toMatchObject({ amount: 500, method: 'CASH' })
  })

  it('rejects a payment for an unknown supplier', async () => {
    await expect(
      recordSupplierPayment(
        {
          supplierId: 'no-such-supplier',
          amount: 100,
          paymentDate: new Date().toISOString(),
          method: 'UPI',
        },
        fx.globalActor
      )
    ).rejects.toThrow('Not Found: supplier')
  })

  // ── Purchase returns ───────────────────────────────────────

  it('creates a purchase return that reverses inventory, batch, and ledger', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    const result = await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-R1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-R1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    const batch = await prisma.batch.findUnique({
      where: { productId_batchNumber: { productId: fx.para, batchNumber: 'BT-R1' } },
    })

    const ret = await createPurchaseReturn(
      {
        purchaseId,
        supplierId: fx.supplierId,
        returnNumber: 'PR-001',
        returnDate: new Date().toISOString(),
        reason: 'Damaged in transit',
        items: [
          {
            purchaseItemId: itemId,
            quantity: 10,
            unitCost: 10,
            reason: 'Cracked strips',
            batchId: batch?.id,
          },
        ],
      },
      fx.globalActor
    )

    expect(ret.status).toBe('PENDING')
    expect(ret.totalAmount.toNumber()).toBe(100) // 10 × 10

    const retItem = await prisma.purchaseReturnItem.findFirst({
      where: { purchaseReturnId: ret.id },
    })
    expect(retItem?.productId).toBe(fx.para)
    expect(retItem?.quantity).toBe(10)
    expect(retItem?.batchId).toBe(batch?.id)

    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(90)
    expect(inv?.availableQuantity).toBe(90)

    const batchAfter = await prisma.batch.findUnique({ where: { id: batch?.id } })
    expect(batchAfter?.quantity).toBe(90)

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'PURCHASE_RETURN' },
    })
    expect(movement?.type).toBe('OUT')
    expect(movement?.quantity).toBe(10)
    expect(movement?.quantityBefore).toBe(100)
    expect(movement?.quantityAfter).toBe(90)

    // GRN accrual (P1-2) then return: the payable moves 1000 -> 900,
    // and the return's own DEBIT entry is identified by reference.
    const grnLedger = await prisma.supplierLedger.findFirst({
      where: { referenceType: 'PURCHASE' },
    })
    expect(grnLedger?.type).toBe('DEBIT')
    expect(grnLedger?.balance.toNumber()).toBe(1000)

    const ledger = await prisma.supplierLedger.findFirst({
      where: { referenceType: 'PURCHASE_RETURN' },
    })
    expect(ledger?.type).toBe('DEBIT')
    expect(ledger?.amount.toNumber()).toBe(100)
    expect(ledger?.balance.toNumber()).toBe(900)

    const supplier = await prisma.supplier.findUnique({ where: { id: fx.supplierId } })
    expect(supplier?.outstandingBalance.toNumber()).toBe(900)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PURCHASE_RETURN_CREATE', entity: 'PurchaseReturn' },
    })
    expect(audit?.entityId).toBe(ret.id)
    expect(audit?.metadata).toMatchObject({ returnNumber: 'PR-001', itemCount: 1 })
    void result
  })

  it('rejects a return quantity that exceeds the received quantity', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-R2',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-R2',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    await expect(
      createPurchaseReturn(
        {
          purchaseId,
          supplierId: fx.supplierId,
          returnNumber: 'PR-002',
          returnDate: new Date().toISOString(),
          reason: 'Too much',
          items: [{ purchaseItemId: itemId, quantity: 200, unitCost: 10, reason: 'Surplus' }],
        },
        fx.globalActor
      )
    ).rejects.toThrow('exceeds received quantity')
  })

  it('rejects a return when the purchase has not been received', async () => {
    const purchase = await createPurchase(poCommand(fx), fx.branchAUser) // DRAFT

    await expect(
      createPurchaseReturn(
        {
          purchaseId: purchase.id,
          supplierId: fx.supplierId,
          returnNumber: 'PR-003',
          returnDate: new Date().toISOString(),
          reason: 'Nope',
          items: [
            { purchaseItemId: purchase.items[0].id, quantity: 1, unitCost: 10, reason: 'Nope' },
          ],
        },
        fx.globalActor
      )
    ).rejects.toThrow('Purchase must be received before creating a return')
  })

  // ── Reads & isolation ──────────────────────────────────────

  it('lists purchases and filters by supplier and status', async () => {
    const { id } = await orderPurchase(fx)

    const all = await listPurchases(
      { page: 1, limit: 10, sortBy: 'purchaseDate', sortOrder: 'desc' },
      fx.globalActor
    )
    expect(all.pagination.total).toBe(1)

    const bySupplier = await listPurchases(
      { supplierId: fx.supplierId, page: 1, limit: 10, sortBy: 'purchaseDate', sortOrder: 'desc' },
      fx.globalActor
    )
    expect(bySupplier.data).toHaveLength(1)

    const byStatus = await listPurchases(
      { status: 'ORDERED', page: 1, limit: 10, sortBy: 'purchaseDate', sortOrder: 'desc' },
      fx.globalActor
    )
    expect(byStatus.data).toHaveLength(1)

    const detail = await getPurchase(id, fx.globalActor)
    expect(detail?.supplier.name).toBe('Medicare Distributors')
    expect(detail?.items[0].orderedQuantity).toBe(100)
  })

  it('lists GRNs from received and partially received purchases', async () => {
    const { id: purchaseId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-L1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: (await getPurchase(purchaseId, fx.globalActor))!.items[0].id,
            receivedQuantity: 100,
            batchNumber: 'BT-L1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    const grns = await listGrns(
      { page: 1, limit: 10, sortBy: 'grnDate', sortOrder: 'desc' },
      fx.globalActor
    )
    expect(grns.pagination.total).toBe(1)
    // H12 — listGrns reads from the GoodsReceiptNote entity now and surfaces
    // the user-provided grnNumber (no longer aliases the PO purchaseNumber).
    expect(grns.data[0].grnNumber).toBe('GRN-L1')
    expect(grns.data[0].purchaseId).toBe(purchaseId)
    expect(grns.data[0].branchId).toBe(fx.branchA)
  })

  it('returns purchase-return history', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-RL',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-RL',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    await createPurchaseReturn(
      {
        purchaseId,
        supplierId: fx.supplierId,
        returnNumber: 'PR-004',
        returnDate: new Date().toISOString(),
        reason: 'Defective',
        items: [{ purchaseItemId: itemId, quantity: 5, unitCost: 10, reason: 'Defective' }],
      },
      fx.globalActor
    )

    const returns = await listPurchaseReturns(
      { page: 1, limit: 10, sortBy: 'returnDate', sortOrder: 'desc' },
      fx.globalActor
    )
    expect(returns.pagination.total).toBe(1)
    expect(returns.data[0].supplier.name).toBe('Medicare Distributors')
    expect(returns.data[0].purchase.purchaseNumber).toBeTruthy()
  })

  it('blocks purchase creation across organizations', async () => {
    await expect(
      createPurchase(poCommand(fx, { branchId: fx.branchA }), fx.otherOrgUser)
    ).rejects.toThrow('Forbidden')
  })

  it('blocks a GRN against another branch purchase order', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchB,
          grnNumber: 'GRN-X',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 10,
              batchNumber: 'BT-X',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchBUser
      )
    ).rejects.toThrow('Forbidden')
  })

  // ── Regression tests for Phase 4 fixes ────────────────────────

  it('calculates PO line totalAmount and mrp server-side with discount and tax', async () => {
    const purchase = await createPurchase(
      poCommand(fx, {
        items: [
          {
            productId: fx.para,
            orderedQuantity: 50,
            unitCost: 20,
            discountPercent: 10, // 10% discount
            taxPercent: 18, // 18% tax
          },
        ],
      }),
      fx.branchAUser
    )

    // lineSubtotal = 50 * 20 = 1000
    // discountAmount = 1000 * 10% = 100
    // taxableAmount = 900
    // taxAmount = 900 * 18% = 162
    // totalAmount = 900 + 162 = 1062
    expect(purchase.items[0].totalAmount.toNumber()).toBe(1062)
    expect(purchase.items[0].taxAmount.toNumber()).toBe(162)
    expect(purchase.items[0].mrp.toNumber()).toBe(100) // from product master
  })

  it('three-way matching uses real calculated PO amount (no manual patch needed)', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-REG1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-REG1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    // No manual patch of totalAmount needed - it's calculated at PO creation
    const poItem = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(poItem?.totalAmount.toNumber()).toBe(1000) // 100 * 10 * 1 * 1 = 1000

    const result = await threeWayMatch(
      {
        purchaseId,
        invoiceNumber: 'INV-REG1',
        items: [
          {
            purchaseItemId: itemId,
            invoiceQuantity: 100,
            invoiceAmount: 1000,
            tolerancePercent: 2,
          },
        ],
      },
      fx.globalActor
    )

    expect(result.status).toBe('MATCHED')
    expect(result.mismatches).toHaveLength(0)
  })

  it('full GRN returns committed RECEIVED status (not stale PARTIALLY_RECEIVED)', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    const result = await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-STATUS1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-STATUS1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    // The returned purchase should reflect the COMMITTED state (RECEIVED)
    // not the mid-transaction PARTIALLY_RECEIVED state
    expect(result.purchase.status).toBe('RECEIVED')

    // Verify committed state in DB
    const committed = await getPurchase(purchaseId, fx.globalActor)
    expect(committed?.status).toBe('RECEIVED')
  })

  it('partial GRN returns PARTIALLY_RECEIVED, then full GRN returns RECEIVED', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    // First GRN: partial (40 of 100)
    const r1 = await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-SEQ1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 40,
            batchNumber: 'BT-SEQ1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    expect(r1.purchase.status).toBe('PARTIALLY_RECEIVED')

    // Second GRN: complete the remaining 60
    const r2 = await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-SEQ2',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 60,
            batchNumber: 'BT-SEQ2',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    expect(r2.purchase.status).toBe('RECEIVED')
  })

  it('over-receiving is prevented by validation and CAS on PurchaseItem.receivedQuantity', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)

    // First GRN receives partial quantity (50 of 100) - should succeed
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-CONC1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 50,
            batchNumber: 'BT-CONC1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )

    // Second GRN attempting to receive more than remaining (60) should fail
    // because the over-receiving validation catches it (remaining = 50, trying 60)
    await expect(
      createGrn(
        {
          purchaseId,
          branchId: fx.branchA,
          grnNumber: 'GRN-CONC2',
          grnDate: new Date(),
          items: [
            {
              purchaseItemId: itemId,
              receivedQuantity: 60, // Exceeds remaining 50
              batchNumber: 'BT-CONC2',
              expiryDate: inDays(300),
              purchasePrice: 10,
              mrp: 100,
              qualityCheckPassed: true,
            },
          ],
        },
        fx.branchAUser
      )
    ).rejects.toThrow('Over-receiving')

    // Verify received quantity never exceeds ordered
    const finalItem = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(finalItem?.receivedQuantity).toBe(50)
  })

  it('PurchaseItem.mrp is derived from Product master at PO creation', async () => {
    // Create a product with a specific MRP
    const customProduct = await prisma.product.create({
      data: {
        name: 'Custom Drug',
        sku: 'CUSTOM-001',
        barcode: '99999999',
        mrp: 250.75,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        createdById: fx.userAId,
      },
    })

    const purchase = await createPurchase(
      poCommand(fx, {
        items: [
          {
            productId: customProduct.id,
            orderedQuantity: 10,
            unitCost: 50,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      }),
      fx.branchAUser
    )

    expect(purchase.items[0].mrp.toNumber()).toBe(250.75)
  })

  it('PurchaseItem.totalAmount handles discount and tax correctly', async () => {
    const purchase = await createPurchase(
      poCommand(fx, {
        items: [
          {
            productId: fx.para,
            orderedQuantity: 10,
            unitCost: 100,
            discountPercent: 20, // 20% discount
            taxPercent: 12, // 12% tax
          },
        ],
      }),
      fx.branchAUser
    )

    // lineSubtotal = 10 * 100 = 1000
    // discountAmount = 1000 * 20% = 200
    // taxableAmount = 800
    // taxAmount = 800 * 12% = 96
    // totalAmount = 800 + 96 = 896
    expect(purchase.items[0].totalAmount.toNumber()).toBe(896)
    expect(purchase.items[0].taxAmount.toNumber()).toBe(96)
    expect(purchase.items[0].discountPercent.toNumber()).toBe(20)
    expect(purchase.items[0].taxPercent.toNumber()).toBe(12)
  })

  // ── C1: branch isolation on purchase/return reads ──────────────

  it('scopes purchase lists to the caller branch by default', async () => {
    const poA = await orderPurchase(fx)
    const poB = await orderPurchase(fx, { branchId: fx.branchB })
    const base = { page: 1, limit: 10, sortBy: 'purchaseDate', sortOrder: 'desc' } as const

    const mine = await listPurchases(base, fx.branchAUser)
    expect(mine.data.map((p) => p.id)).toEqual([poA.id])

    // Explicit same-organization branch filter is allowed.
    const explicit = await listPurchases({ ...base, branchId: fx.branchB }, fx.branchAUser)
    expect(explicit.data.map((p) => p.id)).toEqual([poB.id])

    // Explicit cross-organization branch filter is denied.
    await expect(listPurchases({ ...base, branchId: fx.branchC }, fx.branchAUser)).rejects.toThrow(
      'Forbidden'
    )

    const all = await listPurchases(base, fx.globalActor)
    expect(all.pagination.total).toBe(2)
  })

  it('enforces record-level branch access on getPurchase', async () => {
    const { id } = await orderPurchase(fx)

    await expect(getPurchase(id, fx.branchAUser)).resolves.toMatchObject({ id })
    // Same organization, different branch: readable per branch-access design.
    await expect(getPurchase(id, fx.branchBUser)).resolves.toMatchObject({ id })
    await expect(getPurchase(id, fx.otherOrgUser)).rejects.toThrow('Forbidden')
    await expect(getPurchase(id, fx.globalActor)).resolves.toMatchObject({ id })
  })

  it('treats suppliers as global for branch-scoped actors', async () => {
    const all = await listSuppliers(
      { page: 1, limit: 10, sortBy: 'name', sortOrder: 'asc' },
      fx.branchAUser
    )
    expect(all.pagination.total).toBeGreaterThanOrEqual(2)

    await expect(getSupplier(fx.supplierId, fx.branchAUser)).resolves.toMatchObject({
      id: fx.supplierId,
    })
  })

  it('scopes purchase-return reads through their purchase branch', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber: 'GRN-C1',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity: 100,
            batchNumber: 'BT-C1',
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    const ret = await createPurchaseReturn(
      {
        purchaseId,
        supplierId: fx.supplierId,
        returnNumber: 'PR-C1',
        returnDate: new Date().toISOString(),
        reason: 'C1 isolation check',
        items: [{ purchaseItemId: itemId, quantity: 5, unitCost: 10, reason: 'Damaged' }],
      },
      fx.globalActor
    )
    const base = { page: 1, limit: 10, sortBy: 'returnDate', sortOrder: 'desc' } as const

    const mine = await listPurchaseReturns(base, fx.branchAUser)
    expect(mine.data.map((r) => r.id)).toEqual([ret.id])

    const other = await listPurchaseReturns(base, fx.otherOrgUser)
    expect(other.pagination.total).toBe(0)

    await expect(getPurchaseReturn(ret.id, fx.branchAUser)).resolves.toMatchObject({ id: ret.id })
    await expect(getPurchaseReturn(ret.id, fx.otherOrgUser)).rejects.toThrow('Forbidden')
  })

  // ── C2: GRN quality / cold-chain quarantine ────────────────────

  async function coldProduct(): Promise<string> {
    const p = await prisma.product.create({
      data: {
        name: 'ColdC2',
        sku: `C2-${Date.now()}`,
        barcode: `97${Date.now().toString().slice(-8)}`,
        mrp: 100,
        storageCondition: 'REFRIGERATED',
        unitOfMeasure: 'Strip',
        createdById: fx.userAId,
      },
    })
    return p.id
  }

  function grnInput(
    purchaseId: string,
    itemId: string,
    batchNumber: string,
    extra: Record<string, unknown> = {}
  ) {
    return {
      purchaseId,
      branchId: fx.branchA,
      grnNumber: `GRN-${batchNumber}`,
      grnDate: new Date(),
      items: [
        {
          purchaseItemId: itemId,
          receivedQuantity: 10,
          batchNumber,
          expiryDate: inDays(300),
          purchasePrice: 10,
          mrp: 100,
          qualityCheckPassed: true,
          ...extra,
        },
      ],
    }
  }

  async function batchOf(batchNumber: string) {
    const batch = await prisma.batch.findFirst({ where: { batchNumber } })
    expect(batch).not.toBeNull()
    return batch!
  }

  function expectFefoEligible(
    batch: {
      id: string
      batchNumber: string
      productId: string
      quantity: number
      reservedQuantity: number
      soldQuantity: number
      status: string
      expiryDate: Date
      branchId: string | null
    },
    eligible: boolean
  ) {
    // Uses the ACTUAL persisted batch row so the assertion proves the real
    // batch is (in)eligible for FEFO allocation.
    const candidates = filterEligibleBatches([
      {
        id: batch.id,
        batchNumber: batch.batchNumber,
        productId: batch.productId,
        quantity: batch.quantity,
        reservedQuantity: batch.reservedQuantity,
        soldQuantity: batch.soldQuantity,
        status: batch.status as 'ACTIVE' | 'BLOCKED',
        expiryDate: batch.expiryDate,
        branchId: batch.branchId,
      },
    ])
    expect(candidates.length > 0).toBe(eligible)
  }

  it('receives a quality-passed batch as ACTIVE and FEFO eligible', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(grnInput(purchaseId, itemId, 'BT-C2-OK'), fx.branchAUser)

    const batch = await batchOf('BT-C2-OK')
    expect(batch.status).toBe('ACTIVE')
    expect(batch.blockedReason).toBeNull()
    expectFefoEligible(batch, true)

    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(10)
    expect(inv?.availableQuantity).toBe(10)
  })

  it('quarantines a batch that fails quality check', async () => {
    const { id: purchaseId, itemId } = await orderPurchase(fx)
    await createGrn(
      grnInput(purchaseId, itemId, 'BT-C2-FAILQ', {
        qualityCheckPassed: false,
        qualityCheckNotes: 'Broken seals',
      }),
      fx.branchAUser
    )

    const batch = await batchOf('BT-C2-FAILQ')
    expect(batch.status).toBe('BLOCKED')
    expect(batch.blockedReason).toContain('Broken seals')
    expectFefoEligible(batch, false)

    const log = await prisma.batchStatusLog.findFirst({ where: { batchId: batch.id } })
    expect(log?.fromStatus).toBe('BLOCKED')
    expect(log?.toStatus).toBe('BLOCKED')
    expect(log?.reason).toContain('Quarantined')

    // Physical quantity is preserved; FEFO exclusion (not deletion) is the guard.
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(10)
  })

  it('quarantines a cold-chain batch received without a temperature log', async () => {
    const productId = await coldProduct()
    const { id: purchaseId } = await orderPurchase(fx, {
      items: [{ productId, orderedQuantity: 10, unitCost: 10, discountPercent: 0, taxPercent: 0 }],
    })
    const itemId = (await getPurchase(purchaseId, fx.globalActor))!.items[0].id
    await createGrn(grnInput(purchaseId, itemId, 'BT-C2-NOLOG'), fx.branchAUser)

    const batch = await batchOf('BT-C2-NOLOG')
    expect(batch.status).toBe('BLOCKED')
    expect(batch.blockedReason).toContain('temperature log')
    expectFefoEligible(batch, false)
  })

  it('rejects a cold-chain batch with an unacceptable temperature log', async () => {
    const productId = await coldProduct()
    const { id: purchaseId } = await orderPurchase(fx, {
      items: [{ productId, orderedQuantity: 10, unitCost: 10, discountPercent: 0, taxPercent: 0 }],
    })
    const itemId = (await getPurchase(purchaseId, fx.globalActor))!.items[0].id

    await expect(
      createGrn(
        grnInput(purchaseId, itemId, 'BT-C2-BADTEMP', { coldChainTempLog: '25' }),
        fx.branchAUser
      )
    ).rejects.toThrow('Validation')

    expect(await prisma.batch.findFirst({ where: { batchNumber: 'BT-C2-BADTEMP' } })).toBeNull()
  })

  it('receives a cold-chain batch with an acceptable temperature log as ACTIVE', async () => {
    const productId = await coldProduct()
    const { id: purchaseId } = await orderPurchase(fx, {
      items: [{ productId, orderedQuantity: 10, unitCost: 10, discountPercent: 0, taxPercent: 0 }],
    })
    const itemId = (await getPurchase(purchaseId, fx.globalActor))!.items[0].id
    await createGrn(
      grnInput(purchaseId, itemId, 'BT-C2-OKTEMP', { coldChainTempLog: '5' }),
      fx.branchAUser
    )

    const batch = await batchOf('BT-C2-OKTEMP')
    expect(batch.status).toBe('ACTIVE')
    expect(batch.blockedReason).toBeNull()
    expectFefoEligible(batch, true)
  })

  // ── D2-C: narcotic supplier-return register ────────────────────

  async function narcoticProduct(): Promise<string> {
    const p = await prisma.product.create({
      data: {
        name: 'Morphine 10mg',
        sku: 'NAR-001',
        barcode: '99010001',
        mrp: 100,
        gstRate: 0,
        cgstRate: 0,
        sgstRate: 0,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: fx.userAId,
      },
    })
    return p.id
  }

  async function receiveNarcotic(
    productId: string,
    batchNumber: string,
    grnNumber: string,
    receivedQuantity = 100
  ): Promise<{ purchaseId: string; itemId: string; batchId: string }> {
    const { id: purchaseId, itemId } = await orderPurchase(fx, {
      items: [
        {
          productId,
          orderedQuantity: receivedQuantity,
          unitCost: 10,
          discountPercent: 0,
          taxPercent: 0,
        },
      ],
    })
    await createGrn(
      {
        purchaseId,
        branchId: fx.branchA,
        grnNumber,
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: itemId,
            receivedQuantity,
            batchNumber,
            expiryDate: inDays(300),
            purchasePrice: 10,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      fx.branchAUser
    )
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { productId_batchNumber: { productId, batchNumber } },
    })
    return { purchaseId, itemId, batchId: batch.id }
  }

  function narcoticReturnInput(
    purchaseId: string,
    itemId: string,
    quantity: number,
    batchId: string | undefined,
    returnNumber: string
  ) {
    return {
      purchaseId,
      supplierId: fx.supplierId,
      returnNumber,
      // Fixed +2s offset keeps register entryDate ordering deterministic:
      // the GRN receipt row (grnDate = now) always sorts before return rows.
      returnDate: new Date(Date.now() + 2000).toISOString(),
      reason: 'Narcotic audit return',
      items: [
        {
          purchaseItemId: itemId,
          quantity,
          unitCost: 10,
          reason: 'Expired stock',
          ...(batchId !== undefined ? { batchId } : {}),
        },
      ],
    }
  }

  async function narcoticRows(productId: string) {
    return prisma.narcoticRegister.findMany({
      where: { productId, branchId: fx.branchA },
      orderBy: { entryDate: 'asc' },
    })
  }

  async function narcoticReturnRows(productId: string) {
    return prisma.narcoticRegister.findMany({
      where: {
        productId,
        branchId: fx.branchA,
        movementType: NarcoticMovementType.RETURN_TO_SUPPLIER,
      },
      orderBy: { entryDate: 'asc' },
    })
  }

  it('D2-C-1: narcotic supplier return creates a RETURN_TO_SUPPLIER register row', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-1',
      'GRN-NAR-1'
    )

    const ret = await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-1'),
      fx.globalActor
    )
    expect(ret.status).toBe('PENDING')

    // GRN receipt row + the new return row.
    const rows = await narcoticRows(productId)
    expect(rows).toHaveLength(2)
    expect(rows[0].movementType).toBe(NarcoticMovementType.PURCHASE_RECEIPT)
    expect(rows[0].balanceQuantity).toBe(100)

    const retRows = await narcoticReturnRows(productId)
    expect(retRows).toHaveLength(1)
    expect(retRows[0].movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(retRows[0].referenceType).toBe('PURCHASE_RETURN')
    expect(retRows[0].referenceId).toBe(ret.id)
    expect(retRows[0].productId).toBe(productId)
    expect(retRows[0].batchId).toBe(batchId)
    expect(retRows[0].quantityIn).toBe(0)
    expect(retRows[0].quantityOut).toBe(5)
  })

  it('D2-C-2: narcotic return decrements the running balance (120 -> 115)', async () => {
    const productId = await narcoticProduct()
    // Receiving 120 makes the GRN receipt row itself the 120 previous balance.
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-2',
      'GRN-NAR-2',
      120
    )

    await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-2'),
      fx.globalActor
    )

    const rows = await narcoticRows(productId)
    expect(rows).toHaveLength(2)
    expect(rows[0].movementType).toBe(NarcoticMovementType.PURCHASE_RECEIPT)
    expect(rows[0].balanceQuantity).toBe(120)
    expect(rows[1].movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(rows[1].quantityOut).toBe(5)
    expect(rows[1].balanceQuantity).toBe(115)
  })

  it('D2-C-3: physical inventory state stays synchronized on narcotic return', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-3',
      'GRN-NAR-3'
    )

    const ret = await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 10, batchId, 'PR-NAR-3'),
      fx.globalActor
    )

    const inv = await inventoryFor(productId, fx.branchA)
    expect(inv?.totalQuantity).toBe(90)
    expect(inv?.availableQuantity).toBe(90)

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.quantity).toBe(90)

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'PURCHASE_RETURN', referenceId: ret.id },
    })
    expect(movement).not.toBeNull()
    expect(movement?.type).toBe('OUT')
    expect(movement?.quantity).toBe(10)

    const retRows = await narcoticReturnRows(productId)
    expect(retRows).toHaveLength(1)
    expect(retRows[0].quantityOut).toBe(10)
  })

  it('D2-C-4: narcotic supplier return without batchId is rejected with no durable mutation', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-4',
      'GRN-NAR-4'
    )
    const supplierBefore = await prisma.supplier.findUniqueOrThrow({
      where: { id: fx.supplierId },
    })

    await expect(
      createPurchaseReturn(
        narcoticReturnInput(purchaseId, itemId, 5, undefined, 'PR-NAR-4'),
        fx.globalActor
      )
    ).rejects.toThrow('Batch ID is required for narcotic supplier returns')

    expect(await prisma.purchaseReturn.count({ where: { purchaseId } })).toBe(0)
    expect(await prisma.purchaseReturnItem.count()).toBe(0)
    const inv = await inventoryFor(productId, fx.branchA)
    expect(inv?.totalQuantity).toBe(100)
    expect(inv?.availableQuantity).toBe(100)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(100)
    expect(
      await prisma.inventoryMovement.count({ where: { referenceType: 'PURCHASE_RETURN' } })
    ).toBe(0)
    // Only the GRN receipt row exists; no RETURN_TO_SUPPLIER row was written.
    expect(await narcoticReturnRows(productId)).toHaveLength(0)
    expect(
      await prisma.supplierLedger.count({
        where: { supplierId: fx.supplierId, referenceType: 'PURCHASE_RETURN' },
      })
    ).toBe(0)
    const supplierAfter = await prisma.supplier.findUniqueOrThrow({
      where: { id: fx.supplierId },
    })
    expect(supplierAfter.outstandingBalance.toString()).toBe(
      supplierBefore.outstandingBalance.toString()
    )
    expect(
      await prisma.auditLog.count({
        where: { action: 'PURCHASE_RETURN_CREATE', entity: 'PurchaseReturn' },
      })
    ).toBe(0)
  })

  it('D2-C-5: opening +100, receipt +20, return -5 yields balance 115', async () => {
    const productId = await narcoticProduct()

    // Seed the opening entry first so the GRN receipt itself chains off it
    // (100), then the return chains off the receipt (120 -> 115).
    const openingBatch = await prisma.batch.create({
      data: {
        productId,
        batchNumber: 'BT-NAR-5-OPEN',
        expiryDate: inDays(300),
        purchasePrice: 10,
        mrp: 100,
        quantity: 0,
        branchId: fx.branchA,
      },
    })
    await prisma.narcoticRegister.create({
      data: {
        branchId: fx.branchA,
        productId,
        batchId: openingBatch.id,
        movementType: NarcoticMovementType.OPENING_BALANCE,
        quantityIn: 100,
        quantityOut: 0,
        balanceQuantity: 100,
        referenceType: 'OPENING',
        referenceId: 'seed-opening-5',
        enteredById: fx.userAId,
        entryDate: new Date(Date.now() - 20000),
      },
    })

    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-5',
      'GRN-NAR-5',
      20
    )

    await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-5'),
      fx.globalActor
    )

    const rows = await narcoticRows(productId)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.movementType)).toEqual([
      NarcoticMovementType.OPENING_BALANCE,
      NarcoticMovementType.PURCHASE_RECEIPT,
      NarcoticMovementType.RETURN_TO_SUPPLIER,
    ])
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 120, 115])
    expect(rows[2].quantityOut).toBe(5)
  })

  it('D2-C-6: RETURNS_CREATE permission is required for supplier return creation', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'returns:create'")
    )
    const res = await purchaseReturnsPOST(
      new Request('http://localhost/api/purchase-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId: 'po-1',
          supplierId: fx.supplierId,
          returnDate: new Date().toISOString(),
          reason: 'No permission',
          items: [{ purchaseItemId: 'pi-1', quantity: 1, unitCost: 10, reason: 'Nope' }],
        }),
      }) as unknown as Parameters<typeof purchaseReturnsPOST>[0]
    )
    expect(res.status).toBe(403)
    expect(await prisma.purchaseReturn.count()).toBe(0)
  })

  it('D2-C-7: cross-organization supplier return creation is denied', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-7',
      'GRN-NAR-7'
    )

    await expect(
      createPurchaseReturn(
        narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-7'),
        fx.otherOrgUser
      )
    ).rejects.toThrow('Forbidden')
    expect(await prisma.purchaseReturn.count({ where: { purchaseId } })).toBe(0)
    // The GRN receipt row predates the denied call; no return row was written.
    expect(await narcoticReturnRows(productId)).toHaveLength(0)
  })

  it('D2-C-8: partial narcotic return decrements stock, batch, and balance proportionally', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-8',
      'GRN-NAR-8'
    )

    const ret = await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 30, batchId, 'PR-NAR-8'),
      fx.globalActor
    )
    expect(ret.totalAmount.toNumber()).toBe(300)

    const inv = await inventoryFor(productId, fx.branchA)
    expect(inv?.totalQuantity).toBe(70)
    expect(inv?.availableQuantity).toBe(70)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(70)

    // GRN receipt row (balance 100) plus the partial-return row (100 - 30).
    const rows = await narcoticRows(productId)
    expect(rows).toHaveLength(2)
    expect(rows[0].movementType).toBe(NarcoticMovementType.PURCHASE_RECEIPT)
    expect(rows[0].balanceQuantity).toBe(100)
    expect(rows[1].movementType).toBe(NarcoticMovementType.RETURN_TO_SUPPLIER)
    expect(rows[1].quantityOut).toBe(30)
    expect(rows[1].balanceQuantity).toBe(70)
  })

  it('D2-C-9: duplicate returnNumber is rejected by the existing unique constraint', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-9',
      'GRN-NAR-9'
    )

    await createPurchaseReturn(
      narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-DUP'),
      fx.globalActor
    )
    await expect(
      createPurchaseReturn(
        narcoticReturnInput(purchaseId, itemId, 5, batchId, 'PR-NAR-DUP'),
        fx.globalActor
      )
    ).rejects.toThrow(/Unique constraint failed/)

    expect(await prisma.purchaseReturn.count({ where: { returnNumber: 'PR-NAR-DUP' } })).toBe(1)
  })

  it('D2-C-10: mid-transaction failure rolls back the entire supplier return', async () => {
    const productId = await narcoticProduct()
    const { purchaseId, itemId, batchId } = await receiveNarcotic(
      productId,
      'BT-NAR-10',
      'GRN-NAR-10'
    )
    const supplierBefore = await prisma.supplier.findUniqueOrThrow({
      where: { id: fx.supplierId },
    })

    // First item is a valid narcotic return (writes its register row in-tx);
    // the second item references a nonexistent batch, failing at the batch
    // decrement after the narcotic write. The whole transaction must roll back.
    await expect(
      createPurchaseReturn(
        {
          purchaseId,
          supplierId: fx.supplierId,
          returnNumber: 'PR-NAR-10',
          returnDate: new Date().toISOString(),
          reason: 'Rollback probe',
          items: [
            {
              purchaseItemId: itemId,
              quantity: 5,
              unitCost: 10,
              reason: 'Valid narcotic line',
              batchId,
            },
            {
              purchaseItemId: itemId,
              quantity: 5,
              unitCost: 10,
              reason: 'Bogus batch line',
              batchId: 'batch-does-not-exist',
            },
          ],
        },
        fx.globalActor
      )
    ).rejects.toThrow()

    expect(await prisma.purchaseReturn.count({ where: { purchaseId } })).toBe(0)
    expect(await prisma.purchaseReturnItem.count()).toBe(0)
    const inv = await inventoryFor(productId, fx.branchA)
    expect(inv?.totalQuantity).toBe(100)
    expect(inv?.availableQuantity).toBe(100)
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(100)
    expect(
      await prisma.inventoryMovement.count({ where: { referenceType: 'PURCHASE_RETURN' } })
    ).toBe(0)
    expect(
      await prisma.supplierLedger.count({
        where: { supplierId: fx.supplierId, referenceType: 'PURCHASE_RETURN' },
      })
    ).toBe(0)
    const supplierAfter = await prisma.supplier.findUniqueOrThrow({
      where: { id: fx.supplierId },
    })
    expect(supplierAfter.outstandingBalance.toString()).toBe(
      supplierBefore.outstandingBalance.toString()
    )
    expect(
      await prisma.auditLog.count({
        where: { action: 'PURCHASE_RETURN_CREATE', entity: 'PurchaseReturn' },
      })
    ).toBe(0)
    // Only the GRN receipt row survives; the in-transaction return row rolled back.
    const rows = await narcoticRows(productId)
    expect(rows).toHaveLength(1)
    expect(rows[0].movementType).toBe(NarcoticMovementType.PURCHASE_RECEIPT)
  })
})
