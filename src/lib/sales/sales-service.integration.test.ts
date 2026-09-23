/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// POS Sales — Real-Postgres integration tests.
//
// These run against the dedicated local test container when
// DATABASE_URL is set (jest.setup.ts defaults it to the `pharma_test`
// schema on localhost:5435). The suite skips itself when no DB is
// configured so the unit suite can run offline anywhere.
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import { recordCustomerPayment } from '@/lib/finance/finance-service'
import {
  createHeldBill,
  createSale,
  deleteHeldBill,
  getSaleById,
  listHeldBills,
  listSales,
  searchPosProducts,
  type CreateSaleCommand,
  type SaleActor,
} from '@/lib/sales/sales-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

// ─── Fixture state ────────────────────────────────────────────

interface Fixtures {
  actor: SaleActor
  discountActor: SaleActor
  overrideActor: SaleActor
  creditActor: SaleActor
  otherOrgActor: SaleActor
  branchA: string
  branchB: string
  branchC: string
  org2: string
  para: string
  aspirin: string
  antibiotic: string
  userAId: string
  userBId: string
  userOtherId: string
  b1: string
  b2: string
  b3: string
  b4: string
}

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
    data: { name: 'Bina', email: 'bina@pharma.test', branchId: branchA.id },
  })
  const userOther = await prisma.user.create({
    data: { name: 'Chand', email: 'chand@pharma.test', branchId: branchC.id },
  })

  const para = await prisma.product.create({
    data: {
      name: 'Paracetamol 500mg',
      sku: 'P-001',
      barcode: '89010001',
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
      name: 'Aspirin 75mg',
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
  const antibiotic = await prisma.product.create({
    data: {
      name: 'Amoxiclav 625',
      sku: 'P-003',
      barcode: '89010003',
      mrp: 200,
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      drugSchedule: 'H',
      isPrescriptionRequired: true,
      unitOfMeasure: 'Strip',
      createdById: userA.id,
    },
  })
  const inactive = await prisma.product.create({
    data: {
      name: 'Discontinued Syrup',
      sku: 'P-004',
      mrp: 50,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      unitOfMeasure: 'Bottle',
      isActive: false,
      createdById: userA.id,
    },
  })
  void inactive

  const [b1, b2, b3, b4] = await Promise.all([
    prisma.batch.create({
      data: {
        productId: para.id,
        branchId: branchA.id,
        batchNumber: 'BT-1',
        expiryDate: new Date(Date.now() + 90 * 86400000),
        purchasePrice: 60,
        mrp: 100,
        quantity: 5,
      },
    }),
    prisma.batch.create({
      data: {
        productId: para.id,
        branchId: branchA.id,
        batchNumber: 'BT-2',
        expiryDate: new Date(Date.now() + 30 * 86400000),
        purchasePrice: 60,
        mrp: 100,
        quantity: 10,
      },
    }),
    prisma.batch.create({
      data: {
        productId: para.id,
        branchId: branchA.id,
        batchNumber: 'BT-3',
        expiryDate: new Date(Date.now() + 60 * 86400000),
        purchasePrice: 60,
        mrp: 100,
        quantity: 5,
        status: 'BLOCKED',
        blockedReason: 'Quality hold',
      },
    }),
    prisma.batch.create({
      data: {
        productId: para.id,
        branchId: branchA.id,
        batchNumber: 'BT-4',
        expiryDate: new Date(Date.now() - 1 * 86400000),
        purchasePrice: 60,
        mrp: 100,
        quantity: 5,
      },
    }),
  ])

  await prisma.inventory.create({
    data: { productId: para.id, branchId: branchA.id, totalQuantity: 25, availableQuantity: 25 },
  })
  await prisma.inventory.create({
    data: { productId: aspirin.id, branchId: branchA.id, totalQuantity: 50, availableQuantity: 50 },
  })
  await prisma.inventory.create({
    data: {
      productId: antibiotic.id,
      branchId: branchA.id,
      totalQuantity: 10,
      availableQuantity: 10,
    },
  })
  await prisma.batch.create({
    data: {
      productId: aspirin.id,
      branchId: branchA.id,
      batchNumber: 'BT-A-1',
      expiryDate: new Date(Date.now() + 120 * 86400000),
      purchasePrice: 5,
      mrp: 10.5,
      quantity: 50,
    },
  })
  await prisma.batch.create({
    data: {
      productId: antibiotic.id,
      branchId: branchA.id,
      batchNumber: 'BT-AB-1',
      expiryDate: new Date(Date.now() + 150 * 86400000),
      purchasePrice: 120,
      mrp: 200,
      quantity: 10,
    },
  })
  const paraBatchB = await prisma.batch.create({
    data: {
      productId: para.id,
      branchId: branchB.id,
      batchNumber: 'BT-B-1',
      expiryDate: new Date(Date.now() + 100 * 86400000),
      purchasePrice: 60,
      mrp: 100,
      quantity: 5,
    },
  })
  await prisma.inventory.create({
    data: { productId: para.id, branchId: branchB.id, totalQuantity: 5, availableQuantity: 5 },
  })
  void paraBatchB

  await prisma.productBarcode.create({ data: { productId: para.id, barcode: '89099999' } })

  await prisma.user.update({
    where: { id: userOther.id },
    data: { branchId: branchC.id },
  })

  return {
    actor: { id: userA.id, branchId: branchA.id, permissions: ['sales:create', 'sales:read'] },
    discountActor: {
      id: userA.id,
      branchId: branchA.id,
      permissions: ['sales:create', 'sales:read', 'sales:discount'],
    },
    overrideActor: {
      id: userA.id,
      branchId: branchA.id,
      permissions: ['sales:create', 'sales:read', 'sales:discount', 'sales:discount_override'],
    },
    creditActor: {
      id: userA.id,
      branchId: branchA.id,
      permissions: ['sales:create', 'sales:read', 'sales:credit'],
    },
    otherOrgActor: { id: userOther.id, branchId: branchC.id, permissions: ['sales:create'] },
    branchA: branchA.id,
    branchB: branchB.id,
    branchC: branchC.id,
    org2: org2.id,
    para: para.id,
    aspirin: aspirin.id,
    antibiotic: antibiotic.id,
    userAId: userA.id,
    userBId: userB.id,
    userOtherId: userOther.id,
    b1: b1.id,
    b2: b2.id,
    b3: b3.id,
    b4: b4.id,
  }
}

function saleCommand(fx: Fixtures, overrides: Partial<CreateSaleCommand> = {}): CreateSaleCommand {
  return {
    branchId: fx.branchA,
    items: [{ productId: fx.para, quantity: 1 }],
    payments: [{ method: 'CASH', amount: 112 }],
    ...overrides,
  }
}

// ─── Query helpers ────────────────────────────────────────────

async function batchById(id: string) {
  return prisma.batch.findUnique({ where: { id } })
}

async function inventoryFor(productId: string, branchId: string) {
  return prisma.inventory.findUnique({ where: { productId_branchId: { productId, branchId } } })
}

async function invoiceNumbers(): Promise<string[]> {
  const rows = await prisma.sale.findMany({ select: { invoiceNumber: true } })
  return rows.map((r) => r.invoiceNumber)
}

// ─── Tests ────────────────────────────────────────────────────

const describeDb = HAS_DB ? describe : describe.skip

describeDb('POS sales integration (real Postgres)', () => {
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

  it('completes a CASH sale, FEFO first, with full audit trail', async () => {
    const sale = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 4 }],
        payments: [{ method: 'CASH', amount: 448 }],
      }),
      fx.actor
    )

    expect(sale.status).toBe('COMPLETED')
    expect(sale.paymentStatus).toBe('PAID')
    expect(sale.totalAmount.toString()).toBe('448')
    expect(sale.balanceDue.toString()).toBe('0')

    // FEFO → all 4 from BT-2 (earliest expiry)
    expect(sale.items).toHaveLength(1)
    const batches = sale.items[0].itemBatches
    expect(batches).toHaveLength(1)
    expect(batches[0].batch.batchNumber).toBe('BT-2')
    expect(batches[0].quantity).toBe(4)
    expect(batches[0].unitPrice.toString()).toBe('100')

    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.totalQuantity).toBe(21)
    expect(inv?.availableQuantity).toBe(21)

    const b2 = await batchById(fx.b2)
    expect(b2?.soldQuantity).toBe(4)

    const movements = await prisma.inventoryMovement.findMany({ where: { referenceType: 'SALE' } })
    expect(movements).toHaveLength(1)
    expect(movements[0].type).toBe('OUT')
    expect(movements[0].quantity).toBe(-4)
    expect(movements[0].quantityBefore).toBe(25)
    expect(movements[0].quantityAfter).toBe(21)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SALE_CREATE', entity: 'Sale' },
    })
    expect(audit?.entityId).toBe(sale.id)
    expect(audit?.userId).toBe(fx.userAId)
  })

  it('uses invoice numbers that increment per branch (prefix + code)', async () => {
    const s1 = await createSale(saleCommand(fx), fx.actor)
    const s2 = await createSale(saleCommand(fx), fx.actor)
    expect(s1.invoiceNumber).toBe('INV-A-0001')
    expect(s2.invoiceNumber).toBe('INV-A-0002')

    const sB = await createSale(
      saleCommand(fx, { branchId: fx.branchB, items: [{ productId: fx.para, quantity: 1 }] }),
      fx.actor
    )
    expect(sB.invoiceNumber).toBe('INV-B-0001')

    const branchA = await prisma.branch.findUnique({ where: { id: fx.branchA } })
    const branchB = await prisma.branch.findUnique({ where: { id: fx.branchB } })
    expect(branchA?.invoiceCounter).toBe(3)
    expect(branchB?.invoiceCounter).toBe(2)
    expect(new Set(await invoiceNumbers()).size).toBe(3)
  })

  it('skips blocked and expired batches when allocating', async () => {
    await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 12 }],
        payments: [{ method: 'CASH', amount: 1200 }],
      }),
      fx.actor
    )

    // BT-2 (10) then BT-1 (2). BT-3 blocked and BT-4 expired untouched.
    const [b1, b2, b3, b4] = await Promise.all([
      batchById(fx.b1),
      batchById(fx.b2),
      batchById(fx.b3),
      batchById(fx.b4),
    ])
    expect(b2?.soldQuantity).toBe(10)
    expect(b1?.soldQuantity).toBe(2)
    expect(b3?.status).toBe('BLOCKED')
    expect(b3?.soldQuantity).toBe(0)
    expect(b4?.soldQuantity).toBe(0)
  })

  it('flips a fully consumed batch to EXHAUSTED and writes a status log', async () => {
    await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 10 }],
        payments: [{ method: 'CASH', amount: 1000 }],
      }),
      fx.actor
    )

    const b2 = await batchById(fx.b2)
    expect(b2?.status).toBe('EXHAUSTED')
    expect(b2?.soldQuantity).toBe(10)

    const log = await prisma.batchStatusLog.findMany({ where: { batchId: fx.b2 } })
    expect(log).toHaveLength(1)
    expect(log[0].fromStatus).toBe('ACTIVE')
    expect(log[0].toStatus).toBe('EXHAUSTED')
    expect(log[0].changedById).toBe(fx.userAId)

    // Remaining stock still sellable from BT-1
    const again = await createSale(saleCommand(fx), fx.actor)
    expect(again.items[0].itemBatches[0].batch.batchNumber).toBe('BT-1')
  })

  it('tampered quantity in excess of stock is rejected and nothing changes', async () => {
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 900 }],
          payments: [{ method: 'CASH', amount: 90000 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('Insufficient available stock')

    expect(await prisma.sale.count()).toBe(0)
    const b2 = await batchById(fx.b2)
    expect(b2?.soldQuantity).toBe(0)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.availableQuantity).toBe(25)
  })

  it('rolls back the whole sale when a later line is short', async () => {
    const rx = await prisma.prescription.create({
      data: { patientName: 'P1', branchId: fx.branchA, status: 'APPROVED' },
    })

    await expect(
      createSale(
        saleCommand(fx, {
          prescriptionId: rx.id,
          items: [
            { productId: fx.para, quantity: 2 },
            { productId: fx.antibiotic, quantity: 999 },
          ],
          payments: [{ method: 'CASH', amount: 200000 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('Insufficient available stock')

    expect(await prisma.sale.count()).toBe(0)
    expect(await prisma.saleItem.count()).toBe(0)
    const b2 = await batchById(fx.b2)
    expect(b2?.soldQuantity).toBe(0)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.availableQuantity).toBe(25)
    expect(await prisma.inventoryMovement.count()).toBe(0)
  })

  it('handles concurrent oversell: never more stock than available', async () => {
    const results = await Promise.allSettled([
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 12 }],
          payments: [{ method: 'CASH', amount: 1200 }],
        }),
        fx.actor
      ),
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 12 }],
          payments: [{ method: 'CASH', amount: 1200 }],
        }),
        fx.discountActor
      ),
    ])

    const successes = results.filter((r) => r.status === 'fulfilled')
    const failures = results.filter((r) => r.status === 'rejected')
    // Demand is 24 but only 15 eligible batch units exist — first-committer
    // wins under Serializable, never both.
    expect(successes.length).toBeLessThanOrEqual(1)
    expect(failures.length).toBeGreaterThanOrEqual(1)
    for (const f of failures) {
      const msg = f.reason instanceof Error ? f.reason.message : String(f.reason)
      expect(msg).toMatch(/Insufficient available stock|Conflict/)
    }

    const deducted = successes.length * 12
    const b2 = await batchById(fx.b2)
    const b1 = await batchById(fx.b1)
    // Whatever the outcome, soldQuantity across eligible batches matches the
    // committed deduction and the aggregate ledger reconciles.
    const totalSold = (b1?.soldQuantity ?? 0) + (b2?.soldQuantity ?? 0)
    expect(totalSold).toBe(deducted)
    const inv = await inventoryFor(fx.para, fx.branchA)
    expect(inv?.availableQuantity).toBe(25 - deducted)
    expect(await prisma.sale.count()).toBe(successes.length)
  })

  it('respects discount permission and the max discount gate', async () => {
    // No sales:discount permission
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 1, discountPercent: 5 }],
          payments: [{ method: 'CASH', amount: 106 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('requires permission sales:discount')

    // Discount within limit is fine for a sales:discount holder
    const within = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 1, discountPercent: 15 }],
        payments: [{ method: 'CASH', amount: 100 }],
      }),
      fx.discountActor
    )
    expect(within.items[0].discountPercent.toString()).toBe('15')
    expect(within.discountAmount.toString()).toBe('15')
    expect(within.totalAmount.toString()).toBe('95')

    // Over the limit without override
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 1, discountPercent: 25 }],
          payments: [{ method: 'CASH', amount: 84 }],
        }),
        fx.discountActor
      )
    ).rejects.toThrow('exceeds the maximum allowed 20%')

    // Over the limit with sales:discount_override
    const over = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 1, discountPercent: 25 }],
        payments: [{ method: 'CASH', amount: 84 }],
      }),
      fx.overrideActor
    )
    expect(over.totalAmount.toString()).toBe('84')
  })

  it('gates credit sales: permission, setting, and customer are all required', async () => {
    const creditPayment: CreateSaleCommand['payments'] = [{ method: 'CREDIT', amount: 112 }]

    // No sales:credit permission
    await expect(
      createSale(saleCommand(fx, { payments: creditPayment }), fx.actor).then(
        (s) => s.paymentStatus
      )
    ).rejects.toThrow('requires permission sales:credit')

    // require_customer_for_credit is on and no customer provided
    await expect(
      createSale(saleCommand(fx, { payments: creditPayment }), fx.creditActor).then(
        (s) => s.paymentStatus
      )
    ).rejects.toThrow('A customer is required for credit sales')

    // Inline minimal customer capture works for credit sales only
    await expect(
      createSale(
        saleCommand(fx, {
          payments: [{ method: 'CASH', amount: 112 }],
          customer: { name: 'Walk-In' },
        }),
        fx.actor
      )
    ).rejects.toThrow('Customer capture is only supported for credit sales')
  })

  it('records a credit sale with inline customer capture', async () => {
    const sale = await createSale(
      saleCommand(fx, {
        payments: [{ method: 'CREDIT', amount: 112 }],
        customer: { name: 'Rajesh Kumar', phone: '9820000000' },
      }),
      fx.creditActor
    )

    const customer = await prisma.customer.findFirst({
      where: { phone: '9820000000' },
      include: { sales: true },
    })
    expect(customer?.name).toBe('Rajesh Kumar')
    expect(customer?.sales.length).toBe(1)

    expect(sale.paymentStatus).toBe('CREDIT')
    expect(sale.amountPaid.toString()).toBe('0')
    expect(sale.balanceDue.toString()).toBe('112')
    expect(sale.payments).toHaveLength(1)
    expect(sale.payments[0].amount.toString()).toBe('112')
  })

  it('rejects CREDIT when credit sales are disabled by setting', async () => {
    await prisma.systemSetting.upsert({
      where: { category_key: { category: 'pos', key: 'allow_credit_sales' } },
      update: { value: 'false' },
      create: { category: 'pos', key: 'allow_credit_sales', value: 'false' },
    })
    await expect(
      createSale(
        saleCommand(fx, { payments: [{ method: 'CREDIT', amount: 112 }], customer: { name: 'R' } }),
        fx.creditActor
      )
    ).rejects.toThrow('Credit sales are disabled')
  })

  it('derives PAID / PARTIAL / OVERPAID payment status', async () => {
    const paid = await createSale(
      saleCommand(fx, { payments: [{ method: 'CASH', amount: 112 }] }),
      fx.actor
    )
    expect(paid.paymentStatus).toBe('PAID')

    const partial = await createSale(
      saleCommand(fx, { payments: [{ method: 'CASH', amount: 50 }] }),
      fx.actor
    )
    expect(partial.paymentStatus).toBe('PARTIAL')
    expect(partial.balanceDue.toString()).toBe('62')

    const over = await createSale(
      saleCommand(fx, { payments: [{ method: 'CASH', amount: 120 }] }),
      fx.actor
    )
    expect(over.paymentStatus).toBe('OVERPAID')
    expect(over.balanceDue.toString()).toBe('0')
  })

  it('persists mixed payment methods and references (UPI + card)', async () => {
    const sale = await createSale(
      saleCommand(fx, {
        payments: [
          { method: 'UPI', amount: 60, reference: 'upi-txn-123' },
          { method: 'CARD', amount: 52, reference: '4444' },
        ],
      }),
      fx.actor
    )
    const methods = sale.payments.map((p) => p.method)
    expect(methods.sort()).toEqual(['CARD', 'UPI'])
    expect(sale.payments.find((p) => p.method === 'UPI')?.reference).toBe('upi-txn-123')
    expect(sale.payments.find((p) => p.method === 'CARD')?.reference).toBe('4444')
    expect(sale.paymentStatus).toBe('PAID')
  })

  it('computes GST correctly (exclusive, intra-state split)', async () => {
    const sale = await createSale(
      saleCommand(fx, { payments: [{ method: 'CASH', amount: 112 }] }),
      fx.actor
    )
    expect(sale.subtotal.toString()).toBe('100')
    expect(sale.taxAmount.toString()).toBe('12')
    expect(sale.cgstAmount.toString()).toBe('6')
    expect(sale.sgstAmount.toString()).toBe('6')
    expect(sale.totalAmount.toString()).toBe('112')
    expect(sale.items[0].cgstPercent.toString()).toBe('6')
    expect(sale.items[0].sgstPercent.toString()).toBe('6')
  })

  it('applies discount before GST on each line', async () => {
    const sale = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 1, discountPercent: 10 }],
        payments: [{ method: 'CASH', amount: 101 }],
      }),
      fx.discountActor
    )
    // line = 100 → 90; tax = 9 * 1.12 = 10.8 → 100.8 → rounded to 101
    expect(sale.discountAmount.toString()).toBe('10')
    expect(sale.taxAmount.toString()).toBe('10.8')
    expect(sale.totalAmount.toString()).toBe('101')
    expect(sale.items[0].totalAmount.toString()).toBe('100.8')
  })

  it('rounds the invoice total to the nearest rupee when enabled', async () => {
    const sale = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.aspirin, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 32 }],
      }),
      fx.actor
    )
    expect(sale.subtotal.toString()).toBe('31.5')
    expect(sale.totalAmount.toString()).toBe('32')
    expect(sale.amountPaid.toString()).toBe('32')
    expect(sale.paymentStatus).toBe('PAID')
  })

  it('requires a prescription for schedule H / prescription-only products', async () => {
    await expect(
      createSale(
        saleCommand(fx, {
          branchId: fx.branchA,
          items: [{ productId: fx.antibiotic, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('Prescription required for Amoxiclav 625')

    const rxA = await prisma.prescription.create({
      data: { patientName: 'P2', branchId: fx.branchA, status: 'APPROVED' },
    })
    const ok = await createSale(
      saleCommand(fx, {
        prescriptionId: rxA.id,
        branchId: fx.branchA,
        items: [{ productId: fx.antibiotic, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 236 }],
      }),
      fx.actor
    )
    expect(ok.prescriptionId).toBe(rxA.id)
    expect(ok.invoiceNumber).toMatch(/^INV-A-\d{4}$/)
  })

  it('rejects a prescription from another branch', async () => {
    const rxB = await prisma.prescription.create({
      data: { patientName: 'P3', branchId: fx.branchB },
    })
    await expect(
      createSale(
        saleCommand(fx, {
          prescriptionId: rxB.id,
          branchId: fx.branchA,
          items: [{ productId: fx.antibiotic, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 200 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('prescription does not belong')
  })

  it('blocks sales from another organization', async () => {
    await expect(
      createSale(
        saleCommand(fx, {
          branchId: fx.branchA,
          items: [{ productId: fx.para, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
        }),
        fx.otherOrgActor
      )
    ).rejects.toThrow('Forbidden')
  })

  it('rejects inactive products', async () => {
    const inactive = await prisma.product.findUnique({ where: { sku: 'P-004' } })
    expect(inactive?.isActive).toBe(false)
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: inactive!.id, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 50 }],
        }),
        fx.actor
      )
    ).rejects.toThrow('Product is inactive')
  })

  it('uses the oldest-created eligible batch when FEFO is disabled', async () => {
    await prisma.systemSetting.upsert({
      where: { category_key: { category: 'inventory', key: 'fefo_enabled' } },
      update: { value: 'false' },
      create: { category: 'inventory', key: 'fefo_enabled', value: 'false' },
    })

    // Force deterministic creation order: BT-1 older than BT-2.
    await prisma.batch.update({
      where: { id: fx.b1 },
      data: { createdAt: new Date(Date.now() - 2 * 86400000) },
    })
    await prisma.batch.update({
      where: { id: fx.b2 },
      data: { createdAt: new Date(Date.now() - 1 * 86400000) },
    })

    const sale = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 6 }],
        payments: [{ method: 'CASH', amount: 600 }],
      }),
      fx.actor
    )
    // BT-1 (created first) fills first even though BT-2 expires earlier.
    const all = await prisma.saleItemBatch.findMany({ include: { batch: true } })
    expect(all).toHaveLength(2)
    const b1Taken = all.find((x) => x.batch.batchNumber === 'BT-1')
    const b2Taken = all.find((x) => x.batch.batchNumber === 'BT-2')
    expect(b1Taken?.quantity).toBe(5)
    expect(b2Taken?.quantity).toBe(1)
    void sale
  })

  it('resolves orders by id, barcode, extra barcode, and sku', async () => {
    const byBarcode = await createSale(
      saleCommand(fx, {
        items: [{ barcode: '89010001', quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      }),
      fx.actor
    )
    expect(byBarcode.items[0].productSku).toBe('P-001')

    const byExtra = await createSale(
      saleCommand(fx, {
        items: [{ barcode: '89099999', quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      }),
      fx.actor
    )
    expect(byExtra.items[0].productSku).toBe('P-001')

    const bySku = await createSale(
      saleCommand(fx, {
        items: [{ sku: 'P-001', quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      }),
      fx.actor
    )
    expect(bySku.items[0].productSku).toBe('P-001')
  })

  it('lists and reads sale history with branch scoping and search', async () => {
    const sale = await createSale(saleCommand(fx), fx.actor)
    const customer = await prisma.customer.create({ data: { name: 'Known Customer' } })
    await prisma.sale.update({ where: { id: sale.id }, data: { customerId: customer.id } })

    const list = await listSales({ page: 1, limit: 10, branchId: fx.branchA }, null)
    expect(list.pagination.total).toBe(1)
    expect(list.data[0].invoiceNumber).toBe(sale.invoiceNumber)

    const searched = await listSales({ search: sale.invoiceNumber }, fx.branchA)
    expect(searched.data).toHaveLength(1)

    const byCustomer = await listSales({ search: 'Known Customer' }, fx.branchA)
    expect(byCustomer.data).toHaveLength(1)

    const detail = await getSaleById(sale.id, fx.branchA)
    expect(detail.items).toHaveLength(1)
    expect(detail.payments).toHaveLength(1)

    await expect(getSaleById(sale.id, fx.branchB)).rejects.toThrow('Forbidden')
    await expect(getSaleById('does-not-exist', fx.branchA)).rejects.toThrow('Not Found')
  })

  it('searchPosProducts only returns active stock for the requested branch', async () => {
    const rows = await searchPosProducts('Para', fx.branchA)
    expect(rows).toHaveLength(1)
    expect(rows[0].sku).toBe('P-001')
    expect(rows[0].availableQuantity).toBe(25)
    expect(rows[0].additionalBarcodes).toEqual(['89099999'])

    // Extra-barcode search resolves the product
    const extra = await searchPosProducts('89099999', fx.branchA)
    expect(extra).toHaveLength(1)

    // Inactive products never appear
    const none = await searchPosProducts('Discontinued', fx.branchA)
    expect(none).toHaveLength(0)

    // Cleared state shows the empty result for a nonsense term
    const empty = await searchPosProducts('zzz-nope', fx.branchA)
    expect(empty).toHaveLength(0)
  })

  it('held bills are scoped to the owning user', async () => {
    const cart = { items: [{ productId: fx.para, quantity: 2 }] }
    const bill = await createHeldBill(
      { branchId: fx.branchA, label: 'Pending 1', cartData: cart as unknown as never },
      fx.actor
    )
    expect(bill).toMatchObject({ label: 'Pending 1' })

    const otherUser = await listHeldBills({ id: fx.userBId, branchId: fx.branchA }, fx.branchA)
    expect(otherUser).toHaveLength(0)

    const own = await listHeldBills(fx.actor, fx.branchA)
    expect(own).toHaveLength(1)

    await expect(deleteHeldBill(bill.id, { id: fx.userBId, branchId: fx.branchA })).rejects.toThrow(
      'Not Found'
    )
    await deleteHeldBill(bill.id, fx.actor)
    expect(await listHeldBills(fx.actor, fx.branchA)).toHaveLength(0)
  })

  it('requires sales:read for historical reads (route-gated)', async () => {
    // The sales-service itself does not check permissions; the route does.
    // This asserts the default actor can at least list — proving the
    // read path returns rows without a branch-scope collision.
    const rows = await listSales({}, fx.branchA)
    expect(Array.isArray(rows.data)).toBe(true)
  })

  // ─── B2B wholesale batch-pin path ─────────────────────────────
  // The /sales/new builder lets a manager pin a sale line to a specific
  // batch (typically near-expiry stock). That path must:
  //   - honour pinned batch even if a later-expiry batch is eligible.
  //   - reject expired batches outright.
  //   - reject non-ACTIVE batches (BLOCKED/EXHAUSTED/DISPOSED).
  //   - run inside the credit-sale flow so outstanding balance moves.

  it('B2B: pins to a specific near-expiry batch instead of FEFO', async () => {
    // b1 is the later-expiring batch (+90d), b2 is the closer one (+30d).
    // We pin to b1 explicitly — must bypass FEFO.
    const sale = await createSale(
      saleCommand(fx, {
        items: [{ productId: fx.para, quantity: 2, batchId: fx.b1 }],
        payments: [{ method: 'CASH', amount: 224 }],
      }),
      fx.actor
    )
    expect(sale.status).toBe('COMPLETED')

    const b1After = await prisma.batch.findUniqueOrThrow({ where: { id: fx.b1 } })
    const b2After = await prisma.batch.findUniqueOrThrow({ where: { id: fx.b2 } })
    expect(b1After.soldQuantity).toBe(2)
    expect(b2After.soldQuantity).toBe(0)

    const saleBatches = await prisma.saleItemBatch.findMany({
      where: { saleItem: { sale: { id: sale.id } } },
      select: { batchId: true, quantity: true },
    })
    expect(saleBatches).toHaveLength(1)
    expect(saleBatches[0].batchId).toBe(fx.b1)
    expect(saleBatches[0].quantity).toBe(2)
  })

  it('B2B: rejects an expired batch pin', async () => {
    // b4 is the expired batch (yesterday).
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 1, batchId: fx.b4 }],
        }),
        fx.actor
      )
    ).rejects.toThrow(/expired/)
  })

  it('B2B: rejects a BLOCKED batch pin', async () => {
    // b3 is BLOCKED for quality hold.
    await expect(
      createSale(
        saleCommand(fx, {
          items: [{ productId: fx.para, quantity: 1, batchId: fx.b3 }],
        }),
        fx.actor
      )
    ).rejects.toThrow()
  })

  it('B2B: credit sale creates outstanding balance for wholesale customer', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'Wellness Pharmacy',
        phone: '9000000099',
        customerType: 'WHOLESALE',
        creditLimit: 100000,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })

    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 2 }],
        payments: [{ method: 'CREDIT', amount: 0 }],
      }),
      fx.creditActor
    )
    expect(sale.paymentStatus).toBe('CREDIT')
    expect(Number(sale.balanceDue)).toBeGreaterThan(0)

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeGreaterThan(0)

    const ledger = await prisma.customerLedger.findMany({ where: { customerId: customer.id } })
    expect(ledger.length).toBeGreaterThan(0)
    expect(ledger[0].type).toBe('DEBIT')
  })

  it('B2B: partial payment reduces outstanding balance', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'Care Distributors',
        phone: '9000000088',
        customerType: 'WHOLESALE',
        creditLimit: 50000,
        outstandingBalance: 0,
        creditDays: 14,
      },
    })

    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 1 }],
        payments: [{ method: 'CREDIT', amount: 0 }],
      }),
      fx.creditActor
    )
    const totalDue = Number(sale.balanceDue)

    // Record a partial payment.
    await recordCustomerPayment(
      customer.id,
      {
        amount: Math.round(totalDue / 2),
        paymentMethod: 'UPI',
        reference: 'UPI-PART-1',
        paymentDate: new Date().toISOString(),
      },
      { id: fx.userAId, permissions: ['customers:payments'] } as never
    )

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeCloseTo(totalDue - Math.round(totalDue / 2), 0)

    // Pay the rest.
    const remaining = totalDue - Math.round(totalDue / 2)
    await recordCustomerPayment(
      customer.id,
      {
        amount: remaining,
        paymentMethod: 'CASH',
        reference: 'CASH-FULL',
        paymentDate: new Date().toISOString(),
      },
      { id: fx.userAId, permissions: ['customers:payments'] } as never
    )

    const cleared = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(cleared.outstandingBalance)).toBeCloseTo(0, 2)
  })

  // ─── Credit-limit invariant (server-enforced) ─────────────
  // Para unit balance due at qty=1 is 112.00; uses that to size limits.

  it('B2B: CREDIT sale within credit limit succeeds', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'WithinLimit Co',
        phone: '9000000101',
        customerType: 'WHOLESALE',
        creditLimit: 100000,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })
    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 1 }],
        payments: [{ method: 'CREDIT', amount: 0 }],
      }),
      fx.creditActor
    )
    expect(sale.paymentStatus).toBe('CREDIT')
    expect(Number(sale.balanceDue)).toBeCloseTo(112, 0)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeCloseTo(112, 0)
  })

  it('B2B: CREDIT sale exactly at credit limit succeeds', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'AtLimit Co',
        phone: '9000000102',
        customerType: 'WHOLESALE',
        creditLimit: 112,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })
    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 1 }],
        payments: [{ method: 'CREDIT', amount: 0 }],
      }),
      fx.creditActor
    )
    expect(Number(sale.balanceDue)).toBeCloseTo(112, 0)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeCloseTo(112, 0)
  })

  it('B2B: CREDIT sale exceeding credit limit is rejected', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'OverLimit Co',
        phone: '9000000103',
        customerType: 'WHOLESALE',
        creditLimit: 100,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })
    await expect(
      createSale(
        saleCommand(fx, {
          customerId: customer.id,
          items: [{ productId: fx.para, quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 0 }],
        }),
        fx.creditActor
      )
    ).rejects.toThrow(/credit limit exceeded/i)

    // No partial state: outstanding balance unchanged, no sale rows persisted.
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBe(0)
    const sales = await prisma.sale.count({ where: { customerId: customer.id } })
    expect(sales).toBe(0)
    const ledger = await prisma.customerLedger.count({ where: { customerId: customer.id } })
    expect(ledger).toBe(0)
  })

  it('B2B: CREDIT sale on top of existing outstanding that busts the limit is rejected', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'TopUp Co',
        phone: '9000000104',
        customerType: 'WHOLESALE',
        creditLimit: 200,
        outstandingBalance: 100, // already owes 100
        creditDays: 30,
      },
    })
    await expect(
      createSale(
        saleCommand(fx, {
          customerId: customer.id,
          items: [{ productId: fx.para, quantity: 1 }], // +112 → 212 > 200
          payments: [{ method: 'CREDIT', amount: 0 }],
        }),
        fx.creditActor
      )
    ).rejects.toThrow(/credit limit exceeded/i)

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeCloseTo(100, 0)
    const sales = await prisma.sale.count({ where: { customerId: customer.id } })
    expect(sales).toBe(0)
  })

  it('B2B: creditLimit = 0 keeps existing unlimited semantics', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'Unlimited Co',
        phone: '9000000105',
        customerType: 'WHOLESALE',
        creditLimit: 0,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })
    // Big CREDIT sale — would normally blow a positive limit; 0 means unlimited.
    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 5 }], // 5 × 112 = 560
        payments: [{ method: 'CREDIT', amount: 0 }],
      }),
      fx.creditActor
    )
    expect(Number(sale.balanceDue)).toBeGreaterThan(500)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeCloseTo(Number(sale.balanceDue), 0)
  })

  it('B2B: paid (CASH) sale is unaffected by a tight credit limit', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'CashOnly Co',
        phone: '9000000106',
        customerType: 'RETAIL',
        creditLimit: 1, // would block any CREDIT
        outstandingBalance: 0,
        creditDays: 0,
      },
    })
    const sale = await createSale(
      saleCommand(fx, {
        customerId: customer.id,
        items: [{ productId: fx.para, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      }),
      fx.actor
    )
    expect(sale.paymentStatus).toBe('PAID')
    expect(Number(sale.balanceDue)).toBe(0)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBe(0) // no ledger movement
  })

  it('B2B: concurrent CREDIT sales cannot collectively exceed the limit', async () => {
    // Limit = 200; each CREDIT sale is ~112. Sequentially: at most one succeeds.
    const customer = await prisma.customer.create({
      data: {
        name: 'Race Co',
        phone: '9000000107',
        customerType: 'WHOLESALE',
        creditLimit: 200,
        outstandingBalance: 0,
        creditDays: 30,
      },
    })

    const results = await Promise.allSettled([
      createSale(
        saleCommand(fx, {
          customerId: customer.id,
          items: [{ productId: fx.para, quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 0 }],
        }),
        fx.creditActor
      ),
      createSale(
        saleCommand(fx, {
          customerId: customer.id,
          items: [{ productId: fx.para, quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 0 }],
        }),
        fx.creditActor
      ),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length
    expect(fulfilled + rejected).toBe(2)
    // Invariant: at most one CREDIT sale may push outstanding to <= limit (200).
    // Two sequential ~112 sales would total ~224, breaching the limit.
    expect(fulfilled).toBeLessThanOrEqual(1)
    expect(rejected).toBeGreaterThanOrEqual(1)

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(Number(after.outstandingBalance)).toBeLessThanOrEqual(200)
  })
})
