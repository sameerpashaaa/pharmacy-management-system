/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 6 P1 purchase-side finance remediation — Real PostgreSQL.
//
// P1-1: createPurchase persists header financials (subtotal /
//       discountAmount / taxAmount / totalAmount / balanceDue)
//       derived from line items, so finance aggregates stop
//       reading zeros.
// P1-2: createGrn recognizes the supplier payable — outstandingBalance
//       is incremented by the received share and a SupplierLedger
//       DEBIT entry carries the running balance.
// P1-3: createGrn posts purchase GST from received quantities,
//       delete-and-recreate so partial receipts stay idempotent.
//
// Runs against the dedicated local test container when DATABASE_URL
// is set (jest.setup.ts defaults it to the `pharma_test` schema on
// localhost:5435). Skips when no DB is configured.
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import type { AuthUser } from '@/lib/inventory/branch-access'
import {
  createGrn,
  createPurchase,
  createPurchaseReturn,
  recordSupplierPayment,
  updatePurchase,
  type CreatePurchaseCommand,
} from '@/lib/purchases/purchase-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'batch_status_log',
  'supplier_ledgers',
  'suppliers',
  'purchase_return_items',
  'purchase_returns',
  'purchase_items',
  'purchases',
  'batches',
  'inventory',
  'inventory_movements',
  'gst_transactions',
  'payments',
  'products',
  'users',
  'branches',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

interface Fixtures {
  branchAUser: AuthUser
  globalActor: AuthUser
  branchA: string
  supplierId: string
  para: string
  aspirin: string
}

async function seedFixtures(): Promise<Fixtures> {
  const org = await prisma.organization.create({ data: { name: 'Purchase Fin Org' } })
  const branchA = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'Purchase Fin Branch',
      code: 'PF',
      invoicePrefix: 'INV',
      state: 'DL',
    },
  })

  const userA = await prisma.user.create({
    data: { name: 'PurchaseFin', email: 'pf@pharma.test', branchId: branchA.id },
  })

  const para = await prisma.product.create({
    data: {
      name: 'Paracetamol 500',
      sku: 'PF-001',
      barcode: '89010061',
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })
  const aspirin = await prisma.product.create({
    data: {
      name: 'Aspirin 100',
      sku: 'PF-002',
      barcode: '89010062',
      mrp: 100,
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })

  const supplier = await prisma.supplier.create({
    data: { name: 'Purchase Fin Supplier', creditDays: 30, outstandingBalance: 0, isActive: true },
  })

  return {
    branchAUser: { id: userA.id, branchId: branchA.id },
    globalActor: { id: userA.id, branchId: null },
    branchA: branchA.id,
    supplierId: supplier.id,
    para: para.id,
    aspirin: aspirin.id,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

// ─── Helpers ──────────────────────────────────────────────────

function inDays(days: number): Date {
  return new Date(Date.now() + days * 86400000)
}

interface LineSpec {
  productId: string
  orderedQuantity: number
  unitCost: number
  discountPercent?: number
  taxPercent?: number
}

function poCommand(
  fx: Fixtures,
  items: LineSpec[],
  overrides: Partial<CreatePurchaseCommand> = {}
): CreatePurchaseCommand {
  return {
    branchId: fx.branchA,
    supplierId: fx.supplierId,
    items: items.map((i) => ({
      productId: i.productId,
      orderedQuantity: i.orderedQuantity,
      unitCost: i.unitCost,
      discountPercent: i.discountPercent ?? 0,
      taxPercent: i.taxPercent ?? 0,
    })),
    ...overrides,
  }
}

async function orderPO(
  fx: Fixtures,
  items: LineSpec[]
): Promise<{ id: string; itemIds: string[] }> {
  const purchase = await createPurchase(poCommand(fx, items), fx.branchAUser)
  await updatePurchase(purchase.id, { status: 'ORDERED' }, fx.branchAUser)
  return { id: purchase.id, itemIds: purchase.items.map((i) => i.id) }
}

interface GrnLine {
  purchaseItemId: string
  receivedQuantity: number
  batchNumber: string
}

async function receive(
  fx: Fixtures,
  purchaseId: string,
  grnNumber: string,
  lines: GrnLine[]
): Promise<void> {
  await createGrn(
    {
      purchaseId,
      branchId: fx.branchA,
      grnNumber,
      grnDate: new Date(),
      items: lines.map((l) => ({
        purchaseItemId: l.purchaseItemId,
        receivedQuantity: l.receivedQuantity,
        batchNumber: l.batchNumber,
        expiryDate: inDays(300),
        purchasePrice: 10,
        mrp: 100,
        qualityCheckPassed: true,
      })),
    },
    fx.branchAUser
  )
}

async function supplier(fx: Fixtures) {
  return prisma.supplier.findUnique({ where: { id: fx.supplierId } })
}

describeDb('Phase 6 P1 purchase-side finance remediation (real Postgres)', () => {
  let fx: Fixtures

  beforeAll(async () => {
    await resetDb()
  })

  beforeEach(async () => {
    await resetDb()
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await resetDb()
    await prisma.$disconnect()
  })

  // ── P1-1: Purchase header financials ───────────────────────

  it('persists header totals that reconcile with line items (incl. discount + tax)', async () => {
    const purchase = await createPurchase(
      poCommand(fx, [
        {
          productId: fx.para,
          orderedQuantity: 100,
          unitCost: 10,
          discountPercent: 5,
          taxPercent: 12,
        },
        {
          productId: fx.aspirin,
          orderedQuantity: 50,
          unitCost: 20,
          discountPercent: 0,
          taxPercent: 18,
        },
      ]),
      fx.branchAUser
    )

    // Line A: 1000 - 5% = 950 taxable, +12% = 114 tax, 1064 total.
    // Line B: 1000 taxable, +18% = 180 tax, 1180 total.
    const itemA = purchase.items.find((i) => i.productId === fx.para)
    const itemB = purchase.items.find((i) => i.productId === fx.aspirin)
    expect(itemA?.taxAmount.toNumber()).toBe(114)
    expect(itemA?.totalAmount.toNumber()).toBe(1064)
    expect(itemB?.taxAmount.toNumber()).toBe(180)
    expect(itemB?.totalAmount.toNumber()).toBe(1180)

    expect(purchase.subtotal.toNumber()).toBe(2000)
    expect(purchase.discountAmount.toNumber()).toBe(50)
    expect(purchase.taxAmount.toNumber()).toBe(294)
    expect(purchase.totalAmount.toNumber()).toBe(2244)
    expect(purchase.balanceDue.toNumber()).toBe(2244)
    expect(purchase.amountPaid.toNumber()).toBe(0)

    // Header always reconciles: subtotal - discount + tax === total.
    expect(
      purchase.subtotal.toNumber() -
        purchase.discountAmount.toNumber() +
        purchase.taxAmount.toNumber()
    ).toBe(purchase.totalAmount.toNumber())

    // Header totals equal the sum of the persisted item totals.
    expect(purchase.taxAmount.toNumber()).toBe(
      itemA!.taxAmount.toNumber() + itemB!.taxAmount.toNumber()
    )
    expect(purchase.totalAmount.toNumber()).toBe(
      itemA!.totalAmount.toNumber() + itemB!.totalAmount.toNumber()
    )
  })

  it('persists a zero-tax header and balanceDue equals totalAmount', async () => {
    const purchase = await createPurchase(
      poCommand(fx, [{ productId: fx.para, orderedQuantity: 100, unitCost: 10 }]),
      fx.branchAUser
    )
    expect(purchase.subtotal.toNumber()).toBe(1000)
    expect(purchase.discountAmount.toNumber()).toBe(0)
    expect(purchase.taxAmount.toNumber()).toBe(0)
    expect(purchase.totalAmount.toNumber()).toBe(1000)
    expect(purchase.balanceDue.toNumber()).toBe(1000)
  })

  // ── P1-2: Supplier payable recognised at GRN ───────────────

  it('increments supplier outstandingBalance on a full GRN and posts a DEBIT ledger entry', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10 },
    ])

    await receive(fx, id, 'GRN-P1-1', [
      { purchaseItemId: itemIds[0], receivedQuantity: 100, batchNumber: 'BT-1' },
    ])

    const sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(1000)

    const ledger = await prisma.supplierLedger.findFirst({ where: { supplierId: fx.supplierId } })
    expect(ledger?.type).toBe('DEBIT')
    expect(ledger?.amount.toNumber()).toBe(1000)
    expect(ledger?.balance.toNumber()).toBe(1000)
    expect(ledger?.referenceType).toBe('PURCHASE')
    expect(ledger?.referenceId).toBe(id)
    expect(ledger?.description).toContain('GRN-P1-1')
  })

  it('accrues only the received share across partial GRNs', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10 },
    ])

    await receive(fx, id, 'GRN-P1-P1', [
      { purchaseItemId: itemIds[0], receivedQuantity: 30, batchNumber: 'BT-P1' },
    ])
    let sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(300)

    await receive(fx, id, 'GRN-P1-P2', [
      { purchaseItemId: itemIds[0], receivedQuantity: 70, batchNumber: 'BT-P2' },
    ])
    sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(1000)

    const entries = await prisma.supplierLedger.findMany({
      where: { supplierId: fx.supplierId },
      orderBy: { entryDate: 'asc' },
    })
    expect(entries).toHaveLength(2)
    expect(entries[0].amount.toNumber()).toBe(300)
    expect(entries[0].balance.toNumber()).toBe(300)
    expect(entries[1].amount.toNumber()).toBe(700)
    expect(entries[1].balance.toNumber()).toBe(1000)
  })

  // ── P1-3: Purchase GST posted on receipt ───────────────────

  it('posts purchase GST from received quantities on a full GRN', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10, taxPercent: 12 },
    ])
    const purchase = await prisma.purchase.findUnique({ where: { id } })

    await receive(fx, id, 'GRN-P1-G1', [
      { purchaseItemId: itemIds[0], receivedQuantity: 100, batchNumber: 'BT-G1' },
    ])

    const rows = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: id },
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.taxableAmount.toNumber()).toBe(1000)
    expect(row.cgstAmount.toNumber()).toBe(60)
    expect(row.sgstAmount.toNumber()).toBe(60)
    expect(row.igstAmount.toNumber()).toBe(0)
    expect(row.totalTax.toNumber()).toBe(120)
    expect(row.totalAmount.toNumber()).toBe(1120)
    expect(row.type).toBe('B2B')
    expect(row.branchId).toBe(fx.branchA)
    expect(row.partyName).toBe('Purchase Fin Supplier')
    expect(row.invoiceNumber).toBe(purchase?.purchaseNumber)
    expect(row.returnPeriod).toMatch(/^\d{2}-\d{4}$/)
  })

  it('posts purchase IGST when supplier state differs from branch state', async () => {
    const outOfStateSupplier = await prisma.supplier.create({
      data: {
        name: 'Interstate Supplier',
        state: 'MH',
        creditDays: 30,
        outstandingBalance: 0,
        isActive: true,
      },
    })

    const purchaseCreate = await createPurchase(
      {
        branchId: fx.branchA,
        supplierId: outOfStateSupplier.id,
        items: [
          {
            productId: fx.para,
            orderedQuantity: 100,
            unitCost: 10,
            taxPercent: 12,
            discountPercent: 0,
          },
        ],
      },
      fx.branchAUser
    )
    await updatePurchase(purchaseCreate.id, { status: 'ORDERED' }, fx.branchAUser)
    const id = purchaseCreate.id
    const itemIds = purchaseCreate.items.map((i) => i.id)

    await receive(fx, id, 'GRN-P1-IGST', [
      { purchaseItemId: itemIds[0], receivedQuantity: 100, batchNumber: 'BT-IGST' },
    ])

    const rows = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: id },
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.taxableAmount.toNumber()).toBe(1000)
    expect(row.cgstAmount.toNumber()).toBe(0)
    expect(row.sgstAmount.toNumber()).toBe(0)
    expect(row.igstAmount.toNumber()).toBe(120)
    expect(row.totalTax.toNumber()).toBe(120)
    expect(row.totalAmount.toNumber()).toBe(1120)
  })

  it('keeps purchase GST idempotent across partial GRNs (delete-and-recreate)', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10, taxPercent: 12 },
    ])

    // First partial receipt: 40 units -> tax 48 on 400 taxable.
    await receive(fx, id, 'GRN-P1-G2', [
      { purchaseItemId: itemIds[0], receivedQuantity: 40, batchNumber: 'BT-G2' },
    ])
    let rows = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].taxableAmount.toNumber()).toBe(400)
    expect(rows[0].totalTax.toNumber()).toBe(48)

    // Second partial receipt: rows are replaced (not duplicated) to 100 units.
    await receive(fx, id, 'GRN-P1-G3', [
      { purchaseItemId: itemIds[0], receivedQuantity: 60, batchNumber: 'BT-G3' },
    ])
    rows = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].taxableAmount.toNumber()).toBe(1000)
    expect(rows[0].totalTax.toNumber()).toBe(120)
    expect(rows[0].totalAmount.toNumber()).toBe(1120)
  })

  // ── Atomicity ──────────────────────────────────────────────

  it('rolls back supplier payable and GST when a GRN fails mid-transaction', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10, taxPercent: 12 },
    ])

    await expect(
      receive(fx, id, 'GRN-P1-OVR', [
        { purchaseItemId: itemIds[0], receivedQuantity: 150, batchNumber: 'BT-OVR' },
      ])
    ).rejects.toThrow(/Over-receiving/)

    const sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(0)
    expect(await prisma.supplierLedger.count()).toBe(0)
    expect(await prisma.gstTransaction.count({ where: { referenceId: id } })).toBe(0)
    expect(await prisma.batch.count()).toBe(0)
    expect(await prisma.inventory.count()).toBe(0)
  })

  // ── Regression: return + payment still balance the ledger ──

  it('purchase return after GRN decrements the supplier payable', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10 },
    ])
    await receive(fx, id, 'GRN-P1-RR', [
      { purchaseItemId: itemIds[0], receivedQuantity: 100, batchNumber: 'BT-RR' },
    ])

    await createPurchaseReturn(
      {
        purchaseId: id,
        supplierId: fx.supplierId,
        returnNumber: 'PR-001',
        returnDate: new Date().toISOString(),
        reason: 'Quality issue',
        items: [{ purchaseItemId: itemIds[0], quantity: 30, unitCost: 10, reason: 'Defective' }],
      },
      fx.globalActor
    )

    const sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(700)

    const entries = await prisma.supplierLedger.findMany({
      where: { supplierId: fx.supplierId },
      orderBy: { entryDate: 'asc' },
    })
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ type: 'DEBIT', referenceType: 'PURCHASE' })
    expect(entries[0].balance.toNumber()).toBe(1000)
    expect(entries[1]).toMatchObject({ type: 'DEBIT', referenceType: 'PURCHASE_RETURN' })
    expect(entries[1].balance.toNumber()).toBe(700)
  })

  it('supplier payment after GRN reduces the payable with a CREDIT entry', async () => {
    const { id, itemIds } = await orderPO(fx, [
      { productId: fx.para, orderedQuantity: 100, unitCost: 10 },
    ])
    await receive(fx, id, 'GRN-P1-PY', [
      { purchaseItemId: itemIds[0], receivedQuantity: 100, batchNumber: 'BT-PY' },
    ])

    await recordSupplierPayment(
      {
        supplierId: fx.supplierId,
        amount: 300,
        paymentDate: new Date().toISOString(),
        method: 'CASH',
        reference: 'P1-SETTLE',
      },
      fx.globalActor
    )

    const sup = await supplier(fx)
    expect(sup?.outstandingBalance.toNumber()).toBe(700)

    const entries = await prisma.supplierLedger.findMany({
      where: { supplierId: fx.supplierId },
      orderBy: { entryDate: 'asc' },
    })
    expect(entries).toHaveLength(2)
    const paymentEntry = entries[1]
    expect(paymentEntry.type).toBe('CREDIT')
    expect(paymentEntry.amount.toNumber()).toBe(300)
    expect(paymentEntry.balance.toNumber()).toBe(700)

    const payment = await prisma.payment.findFirst({ where: { supplierId: fx.supplierId } })
    expect(payment?.amount.toNumber()).toBe(300)
  })
})
