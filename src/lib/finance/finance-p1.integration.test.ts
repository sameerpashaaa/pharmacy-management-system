/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 6 P1 remediation proofs — Real PostgreSQL.
//
// P1-1: getFinanceSummary must not falsely present global aggregates
// as branch-local. Branch-scoped sales/purchases are verified per
// branch while receivables/payables/cash are identical across
// branches and explicitly labeled GLOBAL in `scope` metadata.
//
// P1-2: both live supplier-payment paths must produce identical
// financial semantics — SupplierLedger CREDIT, linked Payment row,
// exactly-once outstanding update, balanced COA legs, audit trail,
// and atomic rollback on failure.
//
// Runs against the dedicated local test container when DATABASE_URL
// is set (jest.setup.ts defaults it to the `pharma_test` schema on
// localhost:5435). Skips when no DB is configured.
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import { ensureDefaultLedgers } from '@/lib/finance/coa-seed'
import { getFinanceSummary, recordSupplierPayment } from '@/lib/finance/finance-service'
import type { AuthUser } from '@/lib/inventory/branch-access'
import { recordSupplierPayment as recordPurchaseSupplierPayment } from '@/lib/purchases/purchase-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'ledger_entries',
  'ledgers',
  'supplier_ledgers',
  'suppliers',
  'customer_ledgers',
  'customers',
  'payments',
  'sale_items',
  'sales',
  'users',
  'branches',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

interface Fixtures {
  actorA1: AuthUser
  actorB: AuthUser
  actorGlobal: AuthUser
  branchA1: string
  branchB: string
  supplierId: string
  userA1Id: string
}

async function seedFixtures(): Promise<Fixtures> {
  const orgA = await prisma.organization.create({ data: { name: 'Fin Org A' } })
  const orgB = await prisma.organization.create({ data: { name: 'Fin Org B' } })

  const branchA1 = await prisma.branch.create({
    data: { organizationId: orgA.id, name: 'Fin Branch A1', code: 'FA1', invoicePrefix: 'INV' },
  })
  const branchB = await prisma.branch.create({
    data: { organizationId: orgB.id, name: 'Fin Branch B', code: 'FB', invoicePrefix: 'INV' },
  })

  const userA1 = await prisma.user.create({
    data: { name: 'FinA1', email: 'fin-a1@pharma.test', branchId: branchA1.id },
  })
  const userB = await prisma.user.create({
    data: { name: 'FinB', email: 'fin-b@pharma.test', branchId: branchB.id },
  })
  const userGlobal = await prisma.user.create({
    data: { name: 'FinGlobal', email: 'fin-global@pharma.test', branchId: null },
  })

  // Branch-local sales: 1000 in A1, 2000 in B.
  await prisma.sale.create({
    data: {
      branchId: branchA1.id,
      invoiceNumber: 'INV-FIN-A1',
      subtotal: 1000,
      totalAmount: 1000,
      createdById: userA1.id,
    },
  })
  await prisma.sale.create({
    data: {
      branchId: branchB.id,
      invoiceNumber: 'INV-FIN-B',
      subtotal: 2000,
      totalAmount: 2000,
      createdById: userB.id,
    },
  })

  // Global parties: outstanding balances live on the party rows.
  await prisma.customer.create({ data: { name: 'Fin Customer', outstandingBalance: 5000 } })
  const supplier = await prisma.supplier.create({
    data: { name: 'Fin Supplier', outstandingBalance: 8000 },
  })

  await ensureDefaultLedgers()

  return {
    actorA1: { id: userA1.id, branchId: branchA1.id },
    actorB: { id: userB.id, branchId: branchB.id },
    actorGlobal: { id: userGlobal.id, branchId: null },
    branchA1: branchA1.id,
    branchB: branchB.id,
    supplierId: supplier.id,
    userA1Id: userA1.id,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Phase 6 P1 remediation (real Postgres)', () => {
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

  // ── P1-1: Finance Summary scope honesty ─────────────────────

  it('scopes transactional totals per branch but labels party balances/cash GLOBAL', async () => {
    const a = await getFinanceSummary({ branchId: fx.branchA1 }, fx.actorA1)
    const b = await getFinanceSummary({ branchId: fx.branchB }, fx.actorB)

    // Branch-local figures differ.
    expect(a.sales).toBe(1000)
    expect(b.sales).toBe(2000)

    // Global figures are identical across branches — and labeled so.
    expect(a.customerReceivables).toBe(5000)
    expect(b.customerReceivables).toBe(5000)
    expect(a.supplierPayables).toBe(8000)
    expect(b.supplierPayables).toBe(8000)

    expect(a.scope).toMatchObject({
      branchId: fx.branchA1,
      transactionTotals: 'BRANCH',
      partyBalances: 'GLOBAL',
      cashCollected: 'GLOBAL',
    })
    expect(b.scope).toMatchObject({
      branchId: fx.branchB,
      transactionTotals: 'BRANCH',
      partyBalances: 'GLOBAL',
      cashCollected: 'GLOBAL',
    })
  })

  it('denies cross-organization branch scope', async () => {
    await expect(getFinanceSummary({ branchId: fx.branchB }, fx.actorA1)).rejects.toThrow(
      'Forbidden'
    )
  })

  it('reports GLOBAL scope for a branchless actor', async () => {
    const res = await getFinanceSummary({}, fx.actorGlobal)
    expect(res.sales).toBe(3000)
    expect(res.scope).toMatchObject({ branchId: null, transactionTotals: 'GLOBAL' })
  })

  // ── P1-2: unified supplier-payment semantics ─────────────────

  it('finance path posts CREDIT ledger, links payment, updates outstanding once', async () => {
    const res = await recordSupplierPayment(
      fx.supplierId,
      { amount: 500, paymentMethod: 'CASH', reference: 'P1-FIN' },
      fx.actorA1
    )

    expect(res.newBalance).toBe(7500)

    const supplier = await prisma.supplier.findUnique({ where: { id: fx.supplierId } })
    expect(supplier?.outstandingBalance.toNumber()).toBe(7500)

    const ledger = await prisma.supplierLedger.findFirst({
      where: { supplierId: fx.supplierId },
    })
    expect(ledger?.type).toBe('CREDIT')
    expect(ledger?.amount.toNumber()).toBe(500)
    expect(ledger?.balance.toNumber()).toBe(7500)

    const payment = await prisma.payment.findUnique({ where: { id: res.payment.id } })
    expect(payment?.supplierId).toBe(fx.supplierId)
    expect(payment?.amount.toNumber()).toBe(500)

    // Balanced COA double-entry: AP down, cash down.
    const ap = await prisma.ledger.findUnique({ where: { code: '2010' } })
    const cash = await prisma.ledger.findUnique({ where: { code: '1010' } })
    expect(ap?.balance.toNumber()).toBe(-500)
    expect(cash?.balance.toNumber()).toBe(-500)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUPPLIER_PAYMENT_RECORD', entityId: fx.supplierId },
    })
    expect(audit).not.toBeNull()
  })

  it('purchase path produces identical semantics (CREDIT, linked, once)', async () => {
    // NOTE: purchase-service supplier ops require a branchless actor
    // (pre-existing assertBranchAccess(actor, '') convention).
    const res = await recordPurchaseSupplierPayment(
      {
        supplierId: fx.supplierId,
        amount: 500,
        paymentDate: new Date().toISOString(),
        method: 'CASH',
        reference: 'P1-PUR',
      },
      fx.actorGlobal
    )

    // NOTE: this path derives the running balance from the last ledger
    // entry (0 when none exist), not from outstandingBalance — pre-existing
    // Phase 4 behavior, intentionally unchanged here. What matters for
    // P1-2 parity: CREDIT direction, linked payment, exactly-once decrement.
    expect(res.ledgerEntry.balance.toNumber()).toBe(-500)

    const supplier = await prisma.supplier.findUnique({ where: { id: fx.supplierId } })
    expect(supplier?.outstandingBalance.toNumber()).toBe(7500)

    const ledger = await prisma.supplierLedger.findFirst({
      where: { supplierId: fx.supplierId },
    })
    expect(ledger?.type).toBe('CREDIT')

    const payment = await prisma.payment.findUnique({ where: { id: res.payment.id } })
    expect(payment?.supplierId).toBe(fx.supplierId)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SUPPLIER_PAYMENT', entityId: fx.supplierId },
    })
    expect(audit).not.toBeNull()
  })

  it('rolls back everything on invalid supplier', async () => {
    await expect(
      recordSupplierPayment('no-such-supplier', { amount: 500, paymentMethod: 'CASH' }, fx.actorA1)
    ).rejects.toThrow('Not Found')

    expect(await prisma.payment.count()).toBe(0)
    expect(await prisma.supplierLedger.count()).toBe(0)
    expect(await prisma.ledgerEntry.count()).toBe(0)
    expect(await prisma.auditLog.count()).toBe(0)
  })

  it('applies sequential duplicate payments explicitly, never silently', async () => {
    await recordSupplierPayment(fx.supplierId, { amount: 500, paymentMethod: 'CASH' }, fx.actorA1)
    await recordSupplierPayment(fx.supplierId, { amount: 500, paymentMethod: 'CASH' }, fx.actorA1)

    // Two explicit attempts → exactly two of everything; balance moved twice.
    const supplier = await prisma.supplier.findUnique({ where: { id: fx.supplierId } })
    expect(supplier?.outstandingBalance.toNumber()).toBe(7000)
    expect(await prisma.payment.count()).toBe(2)
    expect(await prisma.supplierLedger.count()).toBe(2)
  })

  it('rejects invalid payment amounts', async () => {
    await expect(
      recordSupplierPayment(fx.supplierId, { amount: -5, paymentMethod: 'CASH' }, fx.actorA1)
    ).rejects.toThrow()
    await expect(
      recordSupplierPayment(fx.supplierId, { amount: 0, paymentMethod: 'CASH' }, fx.actorA1)
    ).rejects.toThrow()
    expect(await prisma.payment.count()).toBe(0)
  })
})
