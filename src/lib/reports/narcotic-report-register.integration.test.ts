/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// D2 Remediation #4 — Narcotic report reads the authoritative
// NarcoticRegister chain, NOT InventoryMovement.
//
// Real-Postgres integration tests driven through the actual
// GET /api/reports/narcotics route handler (requirePermission
// mocked; resolveBranchScope + ReportService hit the real DB).
//
// T1  basic chain (OPENING_BALANCE / PURCHASE_RECEIPT / SALES_DISPENSE)
// T2  multi-batch sale chain from the corrected Remediation #3 writer
// T3  RETURN_TO_SUPPLIER + DESTRUCTION movement types surface
// T4  mismatch proof: report follows the register, not inventory rows
// T5  register invariant over the returned report rows + persisted final
// ─────────────────────────────────────────────────────────────
import type { NarcoticMovementType } from '@prisma/client'
import { NextRequest } from 'next/server'

import { GET as narcoticsGET } from '@/app/api/reports/narcotics/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import prisma from '@/lib/db/prisma'
import { createSale, type SaleActor } from '@/lib/sales/sales-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const HAS_DB = Boolean(process.env.DATABASE_URL)
const describeDb = HAS_DB ? describe : describe.skip

interface Fixtures {
  actor: SaleActor
  branchA: string
  userAId: string
  narcotic: string
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
  const org = await prisma.organization.create({ data: { name: 'Narc Report Org' } })
  const branchA = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Narc Report Branch', code: 'NR', invoicePrefix: 'INV' },
  })
  const userA = await prisma.user.create({
    data: { name: 'Narc Reporter', email: 'narc-reporter@narc.test', branchId: branchA.id },
  })
  const narcotic = await prisma.product.create({
    data: {
      name: 'Narcotic Syrup',
      sku: 'NARC-RPT-SYR',
      barcode: 'BAR-NARC-RPT',
      mrp: 150,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Bottle',
      drugSchedule: 'NARCOTIC_NDPS',
      createdById: userA.id,
    },
  })
  await prisma.doctor.create({
    data: {
      name: 'Dr Narcotic',
      registrationNo: 'MCI-NARCOTIC',
      organizationId: org.id,
    },
  })
  return {
    actor: { id: userA.id, branchId: branchA.id, permissions: ['sales:create'] },
    branchA: branchA.id,
    userAId: userA.id,
    narcotic: narcotic.id,
  }
}

async function fakeUser(overrides: { id: string; branchId: string | null }) {
  ;(requirePermission as jest.Mock).mockResolvedValueOnce(overrides)
}

function get(url: string): NextRequest {
  return new NextRequest(url)
}

async function createBatch(
  fx: Fixtures,
  batchNumber: string,
  qty: number,
  expiry = '2028-12-31'
): Promise<string> {
  const batch = await prisma.batch.create({
    data: {
      productId: fx.narcotic,
      branchId: fx.branchA,
      batchNumber,
      expiryDate: new Date(expiry),
      purchasePrice: 100,
      mrp: 150,
      quantity: qty,
      status: 'ACTIVE',
    },
  })
  return batch.id
}

interface RegisterDraft {
  movementType: string
  quantityIn: number
  quantityOut: number
  balanceQuantity: number
  referenceType: string
  referenceId: string
  entryDate: string
  batchId: string
}

async function seedRegister(
  fx: Fixtures,
  productId: string,
  draft: RegisterDraft
): Promise<string> {
  const row = await prisma.narcoticRegister.create({
    data: {
      branchId: fx.branchA,
      productId,
      batchId: draft.batchId,
      movementType: draft.movementType as NarcoticMovementType,
      quantityIn: draft.quantityIn,
      quantityOut: draft.quantityOut,
      balanceQuantity: draft.balanceQuantity,
      referenceType: draft.referenceType,
      referenceId: draft.referenceId,
      entryDate: new Date(draft.entryDate),
      enteredById: fx.userAId,
    },
  })
  return row.id
}

async function seedOpeningBalance(
  fx: Fixtures,
  qty: number,
  entry: string,
  productId: string
): Promise<string> {
  const batchId = await createBatch(fx, `OPEN-${qty}`, qty)
  return seedRegister(fx, productId, {
    movementType: 'OPENING_BALANCE',
    quantityIn: qty,
    quantityOut: 0,
    balanceQuantity: qty,
    referenceType: 'OPENING_BALANCE',
    referenceId: `OB-${Math.random().toString(36).slice(2, 8)}`,
    entryDate: entry,
    batchId,
  })
}

interface ReportRow {
  id: string
  date: string
  movementType: string
  quantityIn: number
  quantityOut: number
  balanceQuantity: number
  referenceType: string
  referenceId: string
  productName: string
  drugSchedule: string
  branchId: string
  productId: string
  batchNumber: string | null
  type: string
  quantity: number
  quantityBefore: number
  quantityAfter: number
}

/** Drive the real API route and return the register rows in chain order. */
async function reportRows(fx: Fixtures, query = ''): Promise<ReportRow[]> {
  await fakeUser({ id: fx.userAId, branchId: fx.branchA })
  const res = await narcoticsGET(
    get(`http://localhost:3000/api/reports/narcotics?branchId=${fx.branchA}${query}`)
  )
  expect(res.status).toBe(200)
  const json = (await res.json()) as { success: boolean; data: ReportRow[] }
  expect(json.success).toBe(true)
  return [...json.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/** Assert the register invariant over the returned report rows. */
function expectInvariant(rows: ReportRow[]): void {
  let prev = 0
  for (const r of rows) {
    expect(r.balanceQuantity).toBe(prev + r.quantityIn - r.quantityOut)
    expect(r.quantityBefore).toBe(prev)
    expect(r.quantityAfter).toBe(r.balanceQuantity)
    expect(r.type).toBe(r.movementType)
    prev = r.balanceQuantity
  }
}

describeDb('Narcotic report — authoritative register source (T1-T5)', () => {
  beforeAll(async () => {
    await seedSystemSettings()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it('T1: basic register report returns the chain 100 -> 150 -> 130', async () => {
    const fx = await seedFixtures()
    const ob = await createBatch(fx, 'OB-BATCH', 100)
    const pr = await createBatch(fx, 'GRN-BATCH', 50)
    const sl = await createBatch(fx, 'SALE-BATCH', 20)
    await seedRegister(fx, fx.narcotic, {
      movementType: 'OPENING_BALANCE',
      quantityIn: 100,
      quantityOut: 0,
      balanceQuantity: 100,
      referenceType: 'OPENING_BALANCE',
      referenceId: 'OB-100',
      entryDate: '2026-09-01T01:00:00.000Z',
      batchId: ob,
    })
    await seedRegister(fx, fx.narcotic, {
      movementType: 'PURCHASE_RECEIPT',
      quantityIn: 50,
      quantityOut: 0,
      balanceQuantity: 150,
      referenceType: 'PURCHASE',
      referenceId: 'PO-1',
      entryDate: '2026-09-02T01:00:00.000Z',
      batchId: pr,
    })
    await seedRegister(fx, fx.narcotic, {
      movementType: 'SALES_DISPENSE',
      quantityIn: 0,
      quantityOut: 20,
      balanceQuantity: 130,
      referenceType: 'SALE',
      referenceId: 'SALE-1',
      entryDate: '2026-09-03T01:00:00.000Z',
      batchId: sl,
    })

    // An unrelated product with a row OUTSIDE the requested date range.
    const otherProduct = await prisma.product.create({
      data: {
        name: 'Old Timing Product',
        sku: 'RPT-OLD',
        mrp: 10,
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: fx.userAId,
      },
    })
    await seedOpeningBalance(fx, 5, '2024-01-01T00:00:00.000Z', otherProduct.id)

    const rows = await reportRows(fx, '&startDate=2026-01-01&endDate=2026-12-31')

    // Date range is scoped by entryDate; the 2024 row is excluded.
    expect(rows.filter((r) => r.productName === 'Old Timing Product')).toHaveLength(0)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.movementType)).toEqual([
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALES_DISPENSE',
    ])
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 150, 130])
    expect(rows.map((r) => r.quantityIn)).toEqual([100, 50, 0])
    expect(rows.map((r) => r.quantityOut)).toEqual([0, 0, 20])
    expect(rows[0].productName).toBe('Narcotic Syrup')
    expect(rows[0].drugSchedule).toBe('NARCOTIC_NDPS')
    expect(rows[0].branchId).toBe(fx.branchA)
    expect(rows[0].productId).toBe(fx.narcotic)
    expect(rows[0].batchNumber).toBe('OB-BATCH')
    expect(rows[1].batchNumber).toBe('GRN-BATCH')
    expect(rows[2].batchNumber).toBe('SALE-BATCH')
    expectInvariant(rows)
  })

  it('T2: multi-batch sale (Remediation #3) surfaces rows 90 and 70, not 80', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z', fx.narcotic)
    await createBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    await createBatch(fx, 'NARC-BATCH-B', 90, '2028-06-01')
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: fx.narcotic, branchId: fx.branchA } },
      update: { totalQuantity: 100, availableQuantity: 100 },
      create: {
        productId: fx.narcotic,
        branchId: fx.branchA,
        totalQuantity: 100,
        availableQuantity: 100,
        reservedQuantity: 0,
      },
    })

    const sale = await createSale(
      {
        branchId: fx.branchA,
        items: [{ productId: fx.narcotic, quantity: 30 }],
        payments: [{ method: 'CASH', amount: 30 * 168 }],
        h1Capture: {
          patientName: 'T2 Patient',
          patientAddress: 'Addr T2',
          patientPhone: '9999999999',
          doctorName: 'Dr Narcotic',
          doctorRegNo: 'MCI-NARCOTIC',
        },
      },
      fx.actor
    )

    const rows = await reportRows(fx)
    const dispense = rows.filter((r) => r.movementType === 'SALES_DISPENSE')
    expect(dispense).toHaveLength(2)
    expect(dispense.map((r) => r.quantityOut)).toEqual([10, 20])
    // The report must expose the persisted chain, never the stale 100 -> 90 -> 80.
    expect(dispense.map((r) => r.balanceQuantity)).toEqual([90, 70])
    expect(dispense.map((r) => r.referenceId)).toEqual([sale.id, sale.id])
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 90, 70])
    expectInvariant(rows)
  })

  it('T3: RETURN_TO_SUPPLIER and DESTRUCTION rows surface with register balances', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z', fx.narcotic)
    const grnBatch = await createBatch(fx, 'GRN-BATCH', 50)
    const supBatch = await createBatch(fx, 'SUP-BATCH', 10)
    const destBatch = await createBatch(fx, 'DEST-BATCH', 20)
    await seedRegister(fx, fx.narcotic, {
      movementType: 'PURCHASE_RECEIPT',
      quantityIn: 50,
      quantityOut: 0,
      balanceQuantity: 150,
      referenceType: 'PURCHASE',
      referenceId: 'PO-2',
      entryDate: '2026-09-04T01:00:00.000Z',
      batchId: grnBatch,
    })
    await seedRegister(fx, fx.narcotic, {
      movementType: 'RETURN_TO_SUPPLIER',
      quantityIn: 0,
      quantityOut: 10,
      balanceQuantity: 140,
      referenceType: 'PURCHASE_RETURN',
      referenceId: 'PR-2',
      entryDate: '2026-09-05T01:00:00.000Z',
      batchId: supBatch,
    })
    await seedRegister(fx, fx.narcotic, {
      movementType: 'DESTRUCTION',
      quantityIn: 0,
      quantityOut: 20,
      balanceQuantity: 120,
      referenceType: 'DISPOSAL',
      referenceId: 'DIS-2',
      entryDate: '2026-09-06T01:00:00.000Z',
      batchId: destBatch,
    })

    const rows = await reportRows(fx)
    expect(rows.map((r) => r.movementType)).toEqual([
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'RETURN_TO_SUPPLIER',
      'DESTRUCTION',
    ])
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 150, 140, 120])
    expect(rows[2].quantityOut).toBe(10)
    expect(rows[3].quantityOut).toBe(20)
    expect(rows[2].referenceType).toBe('PURCHASE_RETURN')
    expect(rows[3].referenceType).toBe('DISPOSAL')
    expectInvariant(rows)

    const persisted = await prisma.narcoticRegister.findFirstOrThrow({
      where: { branchId: fx.branchA, productId: fx.narcotic },
      orderBy: [{ entryDate: 'desc' }],
      select: { balanceQuantity: true },
    })
    expect(persisted.balanceQuantity).toBe(120)
  })

  it('T4: report follows NarcoticRegister, not divergent InventoryMovement rows', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z', fx.narcotic)

    // A stock movement that does NOT correspond to a register movement. Under
    // the old InventoryMovement source this would flood the report (or, under
    // the old wrong ['X','H1'] schedule filter, silently omit the narcotic
    // product entirely). The register is the only source of truth.
    const inv = await prisma.inventory.upsert({
      where: { productId_branchId: { productId: fx.narcotic, branchId: fx.branchA } },
      update: { totalQuantity: 500, availableQuantity: 500 },
      create: {
        productId: fx.narcotic,
        branchId: fx.branchA,
        totalQuantity: 500,
        availableQuantity: 500,
        reservedQuantity: 0,
      },
    })
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        type: 'IN',
        quantity: 999,
        quantityBefore: 0,
        quantityAfter: 999,
        referenceType: 'OTHER',
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
      },
    })

    const rows = await reportRows(fx)
    expect(rows).toHaveLength(1)
    expect(rows[0].movementType).toBe('OPENING_BALANCE')
    expect(rows[0].balanceQuantity).toBe(100)
    // The 999-unit stock movement must not appear anywhere in the report.
    expect(rows.some((r) => r.quantityIn === 999 || r.quantityOut === 999)).toBe(false)
    expect(rows.some((r) => r.referenceType === 'OTHER')).toBe(false)
    expectInvariant(rows)
  })

  it('T5: returned chain invariant agrees with the persisted final register row', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z', fx.narcotic)
    const a = await createBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    const b = await createBatch(fx, 'NARC-BATCH-B', 20, '2028-06-01')
    await seedRegister(fx, fx.narcotic, {
      movementType: 'SALES_DISPENSE',
      quantityIn: 0,
      quantityOut: 10,
      balanceQuantity: 90,
      referenceType: 'SALE',
      referenceId: 'SALE-5A',
      entryDate: '2026-09-07T01:00:00.000Z',
      batchId: a,
    })
    await seedRegister(fx, fx.narcotic, {
      movementType: 'SALES_DISPENSE',
      quantityIn: 0,
      quantityOut: 20,
      balanceQuantity: 70,
      referenceType: 'SALE',
      referenceId: 'SALE-5B',
      entryDate: '2026-09-08T01:00:00.000Z',
      batchId: b,
    })

    const rows = await reportRows(fx)
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 90, 70])
    expectInvariant(rows)

    const persisted = await prisma.narcoticRegister.findFirstOrThrow({
      where: { branchId: fx.branchA, productId: fx.narcotic },
      orderBy: [{ entryDate: 'desc' }],
      select: { balanceQuantity: true },
    })
    expect(rows[rows.length - 1].balanceQuantity).toBe(persisted.balanceQuantity)
    expect(rows[rows.length - 1].balanceQuantity).toBe(70)

    const totalIn = rows.reduce((s, r) => s + r.quantityIn, 0)
    const totalOut = rows.reduce((s, r) => s + r.quantityOut, 0)
    expect(persisted.balanceQuantity).toBe(totalIn - totalOut)
  })
})
