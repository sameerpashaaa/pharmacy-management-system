/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// D2 Remediation #3 — Narcotic register chain integrity for the
// multi-batch narcotic SALE path.
//
// Real-Postgres integration tests. Verifies that a narcotic sale
// consuming multiple batches produces a CHAINED register sequence
// (B - A1, then B - A1 - A2) instead of deriving every movement
// from the same pre-sale committed balance, and that concurrent
// writers on the same branch+product leave an invariant-clean chain.
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import {
  cancelSale,
  createSale,
  type CreateSaleCommand,
  type SaleActor,
} from '@/lib/sales/sales-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)
const describeDb = HAS_DB ? describe : describe.skip

interface Fixtures {
  actor: SaleActor
  orgId: string
  branchA: string
  branchB: string
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
  const org = await prisma.organization.create({ data: { name: 'Narcotic Org' } })
  const branchA = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Narc Branch A', code: 'NA', invoicePrefix: 'INV' },
  })
  const branchB = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Narc Branch B', code: 'NB', invoicePrefix: 'INV' },
  })
  const userA = await prisma.user.create({
    data: { name: 'Registrar', email: 'registrar@narc.test', branchId: branchA.id },
  })
  const narcotic = await prisma.product.create({
    data: {
      name: 'Narcotic Syrup',
      sku: 'NARC-SYR',
      barcode: 'BAR-NARC-1',
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
    orgId: org.id,
    branchA: branchA.id,
    branchB: branchB.id,
    userAId: userA.id,
    narcotic: narcotic.id,
  }
}

/** One transparent opening-balance register row (real persisted row). */
async function seedOpeningBalance(fx: Fixtures, qty: number, entry: string): Promise<void> {
  const openingBatch = await prisma.batch.create({
    data: {
      productId: fx.narcotic,
      branchId: fx.branchA,
      batchNumber: `OPEN-${qty}`,
      expiryDate: new Date('2028-12-31'),
      purchasePrice: 100,
      mrp: 150,
      quantity: qty,
      status: 'ACTIVE',
    },
  })
  await prisma.narcoticRegister.create({
    data: {
      branchId: fx.branchA,
      productId: fx.narcotic,
      batchId: openingBatch.id,
      movementType: 'OPENING_BALANCE',
      quantityIn: qty,
      quantityOut: 0,
      balanceQuantity: qty,
      referenceType: 'OPENING_BALANCE',
      referenceId: `OB-${fx.branchA}`,
      entryDate: new Date(entry),
      enteredById: fx.userAId,
    },
  })
}

/** Add an unopened stock batch to the same branch + product. */
async function addBatch(
  fx: Fixtures,
  batchNumber: string,
  qty: number,
  expiry: string
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

async function setInventory(fx: Fixtures, available: number): Promise<void> {
  await prisma.inventory.upsert({
    where: { productId_branchId: { productId: fx.narcotic, branchId: fx.branchA } },
    update: { totalQuantity: available, availableQuantity: available },
    create: {
      productId: fx.narcotic,
      branchId: fx.branchA,
      totalQuantity: available,
      availableQuantity: available,
      reservedQuantity: 0,
    },
  })
}

function h1(patient: string) {
  return {
    patientName: patient,
    patientAddress: `Addr ${patient}`,
    patientPhone: '9999999999',
    doctorName: 'Dr Narcotic',
    doctorRegNo: 'MCI-NARCOTIC',
  }
}

async function saleCommand(fx: Fixtures, qty: number, patient: string): Promise<CreateSaleCommand> {
  return {
    branchId: fx.branchA,
    items: [{ productId: fx.narcotic, quantity: qty }],
    payments: [{ method: 'CASH', amount: qty * 168 }],
    h1Capture: h1(patient),
  }
}

interface ChainRow {
  movementType: string
  quantityIn: number
  quantityOut: number
  balanceQuantity: number
}

/** The full persisted register chain for a branch + product, in chain order. */
async function registerChain(fx: Fixtures): Promise<ChainRow[]> {
  const rows = await prisma.narcoticRegister.findMany({
    where: { branchId: fx.branchA, productId: fx.narcotic },
    orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
  })
  return rows.map((r) => ({
    movementType: r.movementType,
    quantityIn: r.quantityIn,
    quantityOut: r.quantityOut,
    balanceQuantity: r.balanceQuantity,
  }))
}

/**
 * Reconstruct every register row from the actual persisted rows and assert
 *  balanceQuantity = previous balance + quantityIn - quantityOut.
 * Returns the final reconstructed balance.
 */
async function assertChainInvariant(fx: Fixtures): Promise<number> {
  const rows = await registerChain(fx)
  let prev = 0
  for (const r of rows) {
    expect(r.balanceQuantity).toBe(prev + r.quantityIn - r.quantityOut)
    prev = r.balanceQuantity
  }
  // final balance == opening base + total created - total consumed
  const totalIn = rows.reduce((s, r) => s + r.quantityIn, 0)
  const totalOut = rows.reduce((s, r) => s + r.quantityOut, 0)
  expect(prev).toBe(totalIn - totalOut)
  return prev
}

async function createNarcoticSale(fx: Fixtures, qty: number, patient: string): Promise<string> {
  const sale = await createSale(await saleCommand(fx, qty, patient), fx.actor)
  return sale.id
}

describeDb('Narcotic register chain — multi-batch sale', () => {
  beforeAll(async () => {
    await seedSystemSettings()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it('T1: single-batch narcotic sale produces one chained movement', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z')
    await setInventory(fx, 100)

    await createNarcoticSale(fx, 10, 'T1 Patient')

    const rows = await registerChain(fx)
    expect(rows).toHaveLength(2) // opening + one SALES_DISPENSE
    expect(rows[0]).toMatchObject({
      movementType: 'OPENING_BALANCE',
      quantityIn: 100,
      quantityOut: 0,
      balanceQuantity: 100,
    })
    expect(rows[1]).toMatchObject({
      movementType: 'SALES_DISPENSE',
      quantityIn: 0,
      quantityOut: 10,
      balanceQuantity: 90,
    })
    await assertChainInvariant(fx)
  })

  it('T2: multi-batch narcotic sale chains 100 -> 90 -> 70', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z')
    await addBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    await addBatch(fx, 'NARC-BATCH-B', 90, '2028-06-01')
    await setInventory(fx, 100)

    // FEFO: 10 from batch A (earlier expiry) + 20 from batch B.
    const sale = await createNarcoticSale(fx, 30, 'T2 Patient')

    const dispense = await prisma.narcoticRegister.findMany({
      where: {
        branchId: fx.branchA,
        productId: fx.narcotic,
        referenceType: 'SALE',
        referenceId: sale,
      },
      orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
    })

    // Two register movements — the domain behavior for a two-batch allocation.
    expect(dispense).toHaveLength(2)
    expect(dispense[0].movementType).toBe('SALES_DISPENSE')
    expect(dispense[1].movementType).toBe('SALES_DISPENSE')

    const qtyOut = dispense.map((d) => d.quantityOut)
    const balances = dispense.map((d) => d.balanceQuantity)

    // First movement must NOT be recomputed from 100 for the second.
    expect(qtyOut).toEqual([10, 20])
    expect(balances).toEqual([90, 70])
    expect(qtyOut.reduce((s, q) => s + q, 0)).toBe(30)

    const rows = await registerChain(fx)
    expect(rows.map((r) => r.balanceQuantity)).toEqual([100, 90, 70])
    await assertChainInvariant(fx)
  })

  it('T3: multi-batch invariant sweep across the full chain', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z')
    await addBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    await addBatch(fx, 'NARC-BATCH-B', 90, '2028-06-01')
    await setInventory(fx, 100)

    await createNarcoticSale(fx, 30, 'T3 Patient')

    // Reconstruct the entire chain from the actual rows, verifying the
    // per-row equation and the final ceiling without assuming any value.
    const rows = await registerChain(fx)
    expect(rows).toHaveLength(3)
    let prev = 0
    for (const r of rows) {
      expect(r.balanceQuantity).toBe(prev + r.quantityIn - r.quantityOut)
      prev = r.balanceQuantity
    }
    const totalIn = rows.reduce((s, r) => s + r.quantityIn, 0)
    const totalOut = rows.reduce((s, r) => s + r.quantityOut, 0)
    // final = ceiling(base 0) + created - consumed
    expect(prev).toBe(totalIn - totalOut)
    expect(prev).toBe(70)
    expect(prev).toBe(rows[rows.length - 1].balanceQuantity)
    await assertChainInvariant(fx)
  })

  it('T4: concurrent multi-batch writers serialize and leave an invariant-clean chain', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z')
    await addBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    await addBatch(fx, 'NARC-BATCH-B', 90, '2028-06-01')
    await setInventory(fx, 100)

    // Combined demand (2 x 70 = 140) exceeds available (100), so at most one
    // transaction can ever commit. The winner consumes FEFO: A=10 + B=60.
    const outcomes = await Promise.allSettled([
      createNarcoticSale(fx, 70, 'T4 Patient A'),
      createNarcoticSale(fx, 70, 'T4 Patient B'),
    ])

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled')
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const err = rejected[0].reason
    // Under the existing serialization the loser aborts with a business
    // conflict (batch/inventory/invoice CAS) or — if it only re-reads a
    // post-commit snapshot — an insufficiency error. Either way exactly one
    // sale commits and the register chain stays invariant-clean.
    expect(err.message).toMatch(/Conflict|Insufficient/)

    const saleCount = await prisma.sale.count({ where: { branchId: fx.branchA } })
    expect(saleCount).toBe(1)

    // The committed multi-batch sale wrote TWO chained SALES_DISPENSE rows,
    // 100 -> 90 -> 30 — the second movement used the first's balance, not a
    // stale pre-sale snapshot.
    const hist = await prisma.narcoticRegister.findMany({
      where: { branchId: fx.branchA, productId: fx.narcotic },
      orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
    })
    expect(hist.map((r) => r.balanceQuantity)).toEqual([100, 90, 30])
    const disp = hist.filter((r) => r.movementType === 'SALES_DISPENSE')
    expect(disp.map((d) => d.quantityOut)).toEqual([10, 60])
    expect(disp.map((d) => d.balanceQuantity)).toEqual([90, 30])

    // No movement lost or duplicated: register OUTs match what the successful
    // sale actually consumed from the batches.
    const batchA = await prisma.batch.findUniqueOrThrow({
      where: { productId_batchNumber: { productId: fx.narcotic, batchNumber: 'NARC-BATCH-A' } },
    })
    const batchB = await prisma.batch.findUniqueOrThrow({
      where: { productId_batchNumber: { productId: fx.narcotic, batchNumber: 'NARC-BATCH-B' } },
    })
    expect(batchA.soldQuantity).toBe(10)
    expect(batchB.soldQuantity).toBe(60)

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.narcotic, branchId: fx.branchA } },
    })
    expect(inv.availableQuantity).toBe(30)

    await assertChainInvariant(fx)
  })

  it('T5: sale + cancellation round-trip keeps the chain invariant-clean', async () => {
    const fx = await seedFixtures()
    await seedOpeningBalance(fx, 100, '2026-01-01T00:00:00Z')
    await addBatch(fx, 'NARC-BATCH-A', 10, '2027-06-01')
    await addBatch(fx, 'NARC-BATCH-B', 90, '2028-06-01')
    await setInventory(fx, 100)

    const saleId = await createNarcoticSale(fx, 30, 'T5 Patient')

    await cancelSale(saleId, 'T5 cancel round-trip', {
      id: fx.userAId,
      branchId: fx.branchA,
      permissions: ['sales:void'],
    })

    const rows = await assertChainInvariant(fx)
    // Customer return-like reversal restores the consumed quantity.
    expect(rows).toBe(100)

    const disp = await prisma.narcoticRegister.findMany({
      where: { branchId: fx.branchA, productId: fx.narcotic, movementType: 'SALES_DISPENSE' },
    })
    const rev = await prisma.narcoticRegister.findMany({
      where: { branchId: fx.branchA, productId: fx.narcotic, movementType: 'RETURN_TO_SUPPLIER' },
    })
    expect(disp.map((d) => d.quantityOut)).toEqual([10, 20])
    expect(rev.map((r) => r.quantityIn).sort((a, b) => a - b)).toEqual([10, 20])
  })
})
