/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 5 P1 security regression tests — Real Postgres.
//
// Covers the two P1 fixes from the Phase 5 security hardening:
//  1. Credit-note list/detail branch+organization isolation
//     (listCreditNotes / getCreditNoteById).
//  2. POS prescription gate enforces APPROVED status
//     (PENDING / REJECTED / cross-branch prescriptions rejected).
//
// These run against the dedicated local test container when
// DATABASE_URL is set (jest.setup.ts defaults it to the `pharma_test`
// schema on localhost:5435). The suite skips itself when no DB is
// configured so the unit suite can run offline anywhere.
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import type { ReturnActor } from '@/lib/returns/sale-return-service'
import { getCreditNoteById, listCreditNotes } from '@/lib/returns/sale-return-service'
import { createSale, type SaleActor } from '@/lib/sales/sales-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

interface Fixtures {
  actorA1: SaleActor
  actorA2: SaleActor
  actorB: SaleActor
  actorGlobal: SaleActor
  branchA1: string
  branchA2: string
  branchB: string
  rxProduct: string
  userA1Id: string
  cnA1: string
  cnA2: string
  cnB: string
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
  const orgA = await prisma.organization.create({ data: { name: 'Sec Org A' } })
  const orgB = await prisma.organization.create({ data: { name: 'Sec Org B' } })

  const branchA1 = await prisma.branch.create({
    data: { organizationId: orgA.id, name: 'Sec Branch A1', code: 'SA1', invoicePrefix: 'INV' },
  })
  const branchA2 = await prisma.branch.create({
    data: { organizationId: orgA.id, name: 'Sec Branch A2', code: 'SA2', invoicePrefix: 'INV' },
  })
  const branchB = await prisma.branch.create({
    data: { organizationId: orgB.id, name: 'Sec Branch B', code: 'SB', invoicePrefix: 'INV' },
  })

  const userA1 = await prisma.user.create({
    data: { name: 'SecA1', email: 'sec-a1@pharma.test', branchId: branchA1.id },
  })
  const userA2 = await prisma.user.create({
    data: { name: 'SecA2', email: 'sec-a2@pharma.test', branchId: branchA2.id },
  })
  const userB = await prisma.user.create({
    data: { name: 'SecB', email: 'sec-b@pharma.test', branchId: branchB.id },
  })
  const userGlobal = await prisma.user.create({
    data: { name: 'SecGlobal', email: 'sec-global@pharma.test', branchId: null },
  })

  // Prescription-gated product with stock in branch A1
  const rxProduct = await prisma.product.create({
    data: {
      name: 'Sec Controlled Med',
      sku: 'SEC-RX-001',
      barcode: '89010999',
      mrp: 200,
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      isPrescriptionRequired: true,
      unitOfMeasure: 'Strip',
      createdById: userA1.id,
    },
  })
  await prisma.batch.create({
    data: {
      productId: rxProduct.id,
      branchId: branchA1.id,
      batchNumber: 'SEC-B1',
      expiryDate: new Date(Date.now() + 90 * 86400000),
      purchasePrice: 150,
      mrp: 200,
      quantity: 10,
    },
  })
  await prisma.inventory.create({
    data: {
      productId: rxProduct.id,
      branchId: branchA1.id,
      totalQuantity: 10,
      availableQuantity: 10,
    },
  })

  // One credit note per branch scope: A1, A2 (same org), B (other org)
  async function seedCreditNote(
    tag: string,
    branchId: string,
    userId: string
  ): Promise<{ cnId: string }> {
    const sale = await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `INV-SEC-${tag}`,
        subtotal: 100,
        totalAmount: 100,
        createdById: userId,
      },
    })
    const saleReturn = await prisma.saleReturn.create({
      data: {
        returnNumber: `SR-SEC-${tag}`,
        saleId: sale.id,
        reason: 'Security fixture',
        totalAmount: 100,
      },
    })
    const note = await prisma.creditNote.create({
      data: {
        noteNumber: `CN-SEC-${tag}`,
        saleReturnId: saleReturn.id,
        amount: 100,
      },
    })
    return { cnId: note.id }
  }

  const { cnId: cnA1 } = await seedCreditNote('A1', branchA1.id, userA1.id)
  const { cnId: cnA2 } = await seedCreditNote('A2', branchA2.id, userA2.id)
  const { cnId: cnB } = await seedCreditNote('B', branchB.id, userB.id)

  const perms = ['sales:create', 'sales:read']
  return {
    actorA1: { id: userA1.id, branchId: branchA1.id, permissions: perms },
    actorA2: { id: userA2.id, branchId: branchA2.id, permissions: perms },
    actorB: { id: userB.id, branchId: branchB.id, permissions: perms },
    actorGlobal: { id: userGlobal.id, branchId: null, permissions: perms },
    branchA1: branchA1.id,
    branchA2: branchA2.id,
    branchB: branchB.id,
    rxProduct: rxProduct.id,
    userA1Id: userA1.id,
    cnA1,
    cnA2,
    cnB,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Phase 5 P1 security (real Postgres)', () => {
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

  // ── P1 #1: credit-note tenant isolation ──────────────────────

  it('lists only same-branch credit notes for a branch-bound actor', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    const res = await listCreditNotes({}, actor)
    const ids = res.data.map((n) => n.id)
    expect(ids).toEqual([fx.cnA1])
    expect(res.pagination.total).toBe(1)
  })

  it('returns same-branch credit note detail', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    const note = await getCreditNoteById(fx.cnA1, actor)
    expect(note.id).toBe(fx.cnA1)
    expect(note.saleReturn.sale.branchId).toBe(fx.branchA1)
  })

  it('allows same-organization cross-branch credit note detail (org-wide model)', async () => {
    // Consistent with getSaleReturnById and the documented branch-access
    // model: actors may access branches in their own organization.
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    const note = await getCreditNoteById(fx.cnA2, actor)
    expect(note.id).toBe(fx.cnA2)
  })

  it('denies cross-organization credit note detail', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    await expect(getCreditNoteById(fx.cnB, actor)).rejects.toThrow('Forbidden')
  })

  it('denies cross-organization credit note listing (no leakage)', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    const res = await listCreditNotes({ limit: 100 }, actor)
    expect(res.data.map((n) => n.id)).toEqual([fx.cnA1])
  })

  it('lets a branchless (global) actor list all credit notes', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: null }
    const res = await listCreditNotes({ limit: 100 }, actor)
    expect(res.data.map((n) => n.id).sort()).toEqual([fx.cnA1, fx.cnA2, fx.cnB].sort())
  })

  it('returns Not Found for an unknown credit note id', async () => {
    const actor: ReturnActor = { id: fx.userA1Id, branchId: fx.branchA1 }
    await expect(getCreditNoteById('does-not-exist', actor)).rejects.toThrow('Not Found')
  })

  // ── P1 #2: POS prescription status gate ──────────────────────

  async function makePrescription(status: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<string> {
    const rx = await prisma.prescription.create({
      data: { patientName: 'Sec Patient', branchId: fx.branchA1, status },
    })
    return rx.id
  }

  function rxSaleCommand(prescriptionId?: string) {
    return {
      branchId: fx.branchA1,
      items: [{ productId: fx.rxProduct, quantity: 1 }],
      payments: [{ method: 'CASH' as const, amount: 236 }],
      ...(prescriptionId ? { prescriptionId } : {}),
    }
  }

  it('accepts an APPROVED prescription at POS', async () => {
    const rxId = await makePrescription('APPROVED')
    const sale = await createSale(rxSaleCommand(rxId), fx.actorA1)
    expect(sale.prescriptionId).toBe(rxId)
    expect(sale.status).toBe('COMPLETED')
  })

  it('rejects a PENDING prescription at POS', async () => {
    const rxId = await makePrescription('PENDING')
    const before = await prisma.sale.count()
    await expect(createSale(rxSaleCommand(rxId), fx.actorA1)).rejects.toThrow('not approved')
    // Rejected sale must roll back fully (count includes the 3 fixture sales).
    expect(await prisma.sale.count()).toBe(before)
  })

  it('rejects a REJECTED prescription at POS', async () => {
    const rxId = await makePrescription('REJECTED')
    const before = await prisma.sale.count()
    await expect(createSale(rxSaleCommand(rxId), fx.actorA1)).rejects.toThrow('not approved')
    expect(await prisma.sale.count()).toBe(before)
  })

  it('rejects an APPROVED prescription from another branch', async () => {
    const rx = await prisma.prescription.create({
      data: { patientName: 'Sec Patient B', branchId: fx.branchA2, status: 'APPROVED' },
    })
    await expect(createSale(rxSaleCommand(rx.id), fx.actorA1)).rejects.toThrow('does not belong')
  })

  it('rejects an APPROVED prescription from another organization', async () => {
    const rx = await prisma.prescription.create({
      data: { patientName: 'Sec Patient Org', branchId: fx.branchB, status: 'APPROVED' },
    })
    await expect(createSale(rxSaleCommand(rx.id), fx.actorA1)).rejects.toThrow('does not belong')
  })

  it('still rejects a missing prescription id', async () => {
    await expect(createSale(rxSaleCommand('does-not-exist'), fx.actorA1)).rejects.toThrow(
      'Not Found: prescription'
    )
  })

  it('still sells non-prescription flows without a prescription id', async () => {
    const para = await prisma.product.create({
      data: {
        name: 'Sec Plain Med',
        sku: 'SEC-PLAIN-001',
        mrp: 100,
        gstRate: 0,
        cgstRate: 0,
        sgstRate: 0,
        unitOfMeasure: 'Strip',
        createdById: fx.userA1Id,
      },
    })
    await prisma.batch.create({
      data: {
        productId: para.id,
        branchId: fx.branchA1,
        batchNumber: 'SEC-B-PLAIN',
        expiryDate: new Date(Date.now() + 90 * 86400000),
        purchasePrice: 80,
        mrp: 100,
        quantity: 5,
      },
    })
    await prisma.inventory.create({
      data: { productId: para.id, branchId: fx.branchA1, totalQuantity: 5, availableQuantity: 5 },
    })
    const sale = await createSale(
      {
        branchId: fx.branchA1,
        items: [{ productId: para.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 100 }],
      },
      fx.actorA1
    )
    expect(sale.status).toBe('COMPLETED')
  })
})
