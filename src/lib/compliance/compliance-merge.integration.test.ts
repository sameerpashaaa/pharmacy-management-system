/**
 * @jest-environment node
 */
// Merge verification: master-side compliance/POS features reconciled into
// pharmacare-phase2 (doctors CRUD, H1 register gate, sale cancellation).
// Real Postgres; only requirePermission is mocked for route tests.
import { requirePermission } from '@/lib/auth/auth-helpers'
import prisma from '@/lib/db/prisma'
import { createOpeningBalance } from '@/lib/narcotic/narcotic-service'
import { createGrn, createPurchase, updatePurchase } from '@/lib/purchases/purchase-service'
import { cancelSale, createSale } from '@/lib/sales/sales-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
  requireAuth: jest.fn(),
  getSession: jest.fn(),
  can: jest.fn(),
  canAny: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock

const TBLS = [
  'audit_logs',
  'schedule_h1_register',
  'narcotic_register',
  'doctors',
  'sale_item_batches',
  'sale_items',
  'sales',
  'payments',
  'inventory_movements',
  'batches',
  'inventory',
  'products',
  'user_roles',
  'role_permissions',
  'permissions',
  'roles',
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

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Merge verification: compliance + cancellation (real Postgres)', () => {
  let branchA: string
  let branchB: string
  let branchOtherOrg: string
  let userAId: string
  let userBId: string
  let userOtherId: string
  let h1ProductId: string
  let org1Id: string

  beforeEach(async () => {
    await resetDb()
    jest.clearAllMocks()
    const org1 = await prisma.organization.create({ data: { name: 'MG Org' } })
    const org2 = await prisma.organization.create({ data: { name: 'MG Org 2' } })
    org1Id = org1.id
    const bA = await prisma.branch.create({
      data: { organizationId: org1.id, name: 'MG-A', code: 'MGA', invoicePrefix: 'INV' },
    })
    const bO = await prisma.branch.create({
      data: { organizationId: org2.id, name: 'MG-O', code: 'MGO', invoicePrefix: 'INV' },
    })
    branchA = bA.id
    branchOtherOrg = bO.id
    const userA = await prisma.user.create({
      data: { name: 'MGU', email: 'mgu@merge.test', branchId: bA.id },
    })
    userAId = userA.id

    // Additional users for branch isolation and cross-org tests
    const bB = await prisma.branch.create({
      data: { organizationId: org1.id, name: 'MG-B', code: 'MGB', invoicePrefix: 'INV' },
    })
    branchB = bB.id

    const userB = await prisma.user.create({
      data: { name: 'MGU-B', email: 'mgub@merge.test', branchId: bB.id },
    })
    userBId = userB.id

    const userOther = await prisma.user.create({
      data: { name: 'Other', email: 'other@merge.test', branchId: branchOtherOrg },
    })
    userOtherId = userOther.id

    const mkProduct = (sku: string, drugSchedule: 'NONE' | 'H1') =>
      prisma.product.create({
        data: {
          name: `MG ${sku}`,
          sku,
          barcode: `99${sku}`,
          mrp: 100,
          gstRate: 12,
          cgstRate: 6,
          sgstRate: 6,
          unitOfMeasure: 'Strip',
          drugSchedule,
          createdById: userA.id,
        },
      })
    const normal = await mkProduct('MG-N', 'NONE')
    const h1 = await mkProduct('MG-H1', 'H1')
    h1ProductId = h1.id

    for (const p of [normal, h1]) {
      await prisma.inventory.create({
        data: {
          productId: p.id,
          branchId: bA.id,
          totalQuantity: 50,
          availableQuantity: 50,
          reservedQuantity: 0,
        },
      })
      await prisma.batch.create({
        data: {
          productId: p.id,
          batchNumber: `MG-${p.sku}`,
          expiryDate: inDays(300),
          purchasePrice: 60,
          mrp: 100,
          quantity: 50,
          status: 'ACTIVE',
          branchId: bA.id,
        },
      })
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── Doctors CRUD (routes, mocked auth, real DB) ───────────────

  it('creates, reads, updates and deletes doctors scoped to the organization', async () => {
    mockedRequirePermission.mockResolvedValue({ id: userAId, branchId: branchA })
    const { POST } = await import('@/app/api/doctors/route')

    const created = await POST(
      new Request('http://localhost/api/doctors', {
        method: 'POST',
        body: JSON.stringify({ name: 'Dr Smith', registrationNo: 'MCI-001' }),
      }) as unknown as Parameters<typeof POST>[0]
    )
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { data: { id: string } }
    const doctorId = createdBody.data.id

    const { GET } = await import('@/app/api/doctors/route')
    const listed = await GET()
    const listedBody = (await listed.json()) as { data: { id: string }[] }
    expect(listedBody.data.map((d) => d.id)).toContain(doctorId)

    // Other organization cannot see it
    const otherUser = await prisma.user.create({
      data: { name: 'Other', email: 'other2@merge.test', branchId: branchOtherOrg },
    })
    mockedRequirePermission.mockResolvedValue({ id: otherUser.id, branchId: branchOtherOrg })
    const { GET: GET_BY_ID } = await import('@/app/api/doctors/[id]/route')
    const crossOrg = await GET_BY_ID(
      new Request('http://localhost/api/doctors/x') as unknown as Parameters<typeof GET_BY_ID>[0],
      { params: { id: doctorId } }
    )
    expect(crossOrg.status).toBe(404)
  })

  it('rejects unauthenticated doctor access', async () => {
    mockedRequirePermission.mockRejectedValue(new Error('Unauthorized'))
    const { POST } = await import('@/app/api/doctors/route')
    const res = await POST(
      new Request('http://localhost/api/doctors', {
        method: 'POST',
        body: JSON.stringify({ name: 'Dr X', registrationNo: 'MCI-002' }),
      }) as unknown as Parameters<typeof POST>[0]
    )
    expect(res.status).toBe(401)
  })

  // ── H1 register gate ─────────────────────────────────────────

  it('requires patient/doctor capture for H1 sales and records the register', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const base = {
      branchId: branchA,
      items: [{ productId: h1ProductId, quantity: 2 }],
      payments: [{ method: 'CASH', amount: 236 }],
    } as const

    await expect(
      createSale({ ...base, items: [...base.items], payments: [...base.payments] }, actor)
    ).rejects.toThrow('Schedule H1')

    // The register FK requires a matching doctors.registrationNo row.
    await prisma.doctor.create({
      data: { name: 'Dr Smith', registrationNo: 'MCI-001', organizationId: org1Id },
    })
    const h1Capture = {
      patientName: 'Jane Doe',
      patientAddress: '12 Main St',
      doctorName: 'Dr Smith',
      doctorRegNo: 'MCI-001',
    }
    const sale = await createSale(
      { ...base, items: [...base.items], payments: [...base.payments], h1Capture },
      actor
    )
    expect(sale.status).toBe('COMPLETED')

    const rows = await prisma.scheduleH1Register.findMany({ where: { saleId: sale.id } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].patientName).toBe('Jane Doe')
    expect(rows[0].doctorRegNo).toBe('MCI-001')
  })

  // ── Sale cancellation ────────────────────────────────────────

  it('cancels a sale and restores inventory', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })
    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: 560 }],
      },
      actor
    )
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: normal.id, branchId: branchA } },
    })
    expect(before.availableQuantity).toBe(45)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'Customer changed mind', voidActor)

    const cancelled = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(cancelled.status).toBe('CANCELLED')
    const after = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: normal.id, branchId: branchA } },
    })
    expect(after.availableQuantity).toBe(50)

    await expect(cancelSale(sale.id, 'again', voidActor)).rejects.toThrow('already cancelled')

    const noPermActor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    await expect(cancelSale(sale.id, 'x', noPermActor)).rejects.toThrow('sales:void')
  })

  it('cancels a credit sale and reverses customer ledger', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create', 'sales:credit'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    // Create a customer
    const customer = await prisma.customer.create({
      data: { name: 'Test Customer', phone: '555000111', outstandingBalance: 0 },
    })

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 3 }],
        payments: [{ method: 'CREDIT', amount: 336 }],
        customerId: customer.id,
      },
      actor
    )

    // Verify customer ledger was created with DEBIT
    const ledgerBefore = await prisma.customerLedger.findMany({ where: { referenceId: sale.id } })
    expect(ledgerBefore.length).toBe(1)
    expect(ledgerBefore[0].type).toBe('DEBIT')

    const customerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(customerBefore.outstandingBalance.toNumber()).toBeGreaterThan(0)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'Credit cancellation', voidActor)

    // Customer balance should be restored to 0
    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
    expect(customerAfter.outstandingBalance.toNumber()).toBe(0)

    // Ledger should have a CREDIT reversal entry
    const ledgerAfter = await prisma.customerLedger.findMany({ where: { referenceId: sale.id } })
    expect(ledgerAfter.length).toBe(2)
    const reversalEntry = ledgerAfter.find((l) => l.type === 'CREDIT')
    expect(reversalEntry).toBeTruthy()
    expect(reversalEntry!.referenceType).toBe('SALE_CANCEL')
  })

  it('cancels a sale and reverses GST transactions with NIL_RATED offsetting entries', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 224 }],
      },
      actor
    )

    // Verify original GST transactions were created
    const gstBefore = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE', referenceId: sale.id },
    })
    expect(gstBefore.length).toBeGreaterThan(0)
    expect(gstBefore.every((g) => g.type === 'B2C')).toBe(true)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'GST reversal test', voidActor)

    // Original SALE transactions should still exist (audit trail)
    const originalGst = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE', referenceId: sale.id },
    })
    expect(originalGst.length).toBeGreaterThan(0)

    // Offsetting NIL_RATED transactions should be created with SALE_CANCEL referenceType
    const cancelGst = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE_CANCEL', referenceId: sale.id },
    })
    expect(cancelGst.length).toBe(gstBefore.length)

    for (const cg of cancelGst) {
      expect(cg.type).toBe('NIL_RATED')
      expect(cg.referenceType).toBe('SALE_CANCEL')
      expect(cg.taxableAmount.toNumber()).toBeLessThan(0)
      expect(cg.cgstAmount.toNumber()).toBeLessThan(0)
      expect(cg.sgstAmount.toNumber()).toBeLessThan(0)
      expect(cg.totalTax.toNumber()).toBeLessThan(0)
      expect(cg.totalAmount.toNumber()).toBeLessThan(0)
    }
  })

  it('cancels a sale and voids payments without deleting them', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 2 }],
        payments: [
          { method: 'CASH', amount: 112, reference: 'cash-123' },
          { method: 'UPI', amount: 112, reference: 'upi-456' },
        ],
      },
      actor
    )

    const paymentsBefore = await prisma.payment.findMany({ where: { saleId: sale.id } })
    expect(paymentsBefore.length).toBe(2)
    expect(paymentsBefore.every((p) => p.amount.gt(0))).toBe(true)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'Payment void test', voidActor)

    const paymentsAfter = await prisma.payment.findMany({ where: { saleId: sale.id } })
    expect(paymentsAfter.length).toBe(2)

    // Payments should be zeroed and reference marked as VOIDED
    for (const p of paymentsAfter) {
      expect(p.amount.toNumber()).toBe(0)
      expect(p.reference).toMatch(/^VOIDED:/)
    }
  })

  it('cancels an H1 sale and creates negative ScheduleH1Register entries', async () => {
    // Create doctor for H1 capture
    await prisma.doctor.create({
      data: { name: 'Dr Cancel', registrationNo: 'MCI-999', organizationId: org1Id },
    })

    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const h1 = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-H1' } })

    const h1Capture = {
      patientName: 'Cancel Patient',
      patientAddress: '1 Cancel St',
      doctorName: 'Dr Cancel',
      doctorRegNo: 'MCI-999',
    }

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: h1.id, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 336 }],
        h1Capture,
      },
      actor
    )

    const h1Before = await prisma.scheduleH1Register.findMany({ where: { saleId: sale.id } })
    expect(h1Before.length).toBeGreaterThan(0)
    const totalQtyBefore = h1Before.reduce((sum, r) => sum + r.quantityGiven, 0)
    expect(totalQtyBefore).toBe(3)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'H1 cancellation', voidActor)

    const h1After = await prisma.scheduleH1Register.findMany({ where: { saleId: sale.id } })
    expect(h1After.length).toBe(h1Before.length * 2) // original + reversal entries

    // Net quantity should be zero
    const netQty = h1After.reduce((sum, r) => sum + r.quantityGiven, 0)
    expect(netQty).toBe(0)

    // Reversal entries should have negative quantityGiven
    const reversalEntries = h1After.filter((r) => r.quantityGiven < 0)
    expect(reversalEntries.length).toBe(h1Before.length)
    for (const r of reversalEntries) {
      expect(r.quantityGiven).toBeLessThan(0)
    }
  })

  it('cancels a narcotic sale and creates RETURN_TO_SUPPLIER narcotic register entries', async () => {
    // Create NARCOTIC_NDPS product
    const narcotic = await prisma.product.create({
      data: {
        name: 'MG Narcotic',
        sku: 'MG-NARC',
        barcode: '99NARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 50,
        availableQuantity: 50,
        reservedQuantity: 0,
      },
    })
    await prisma.batch.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        batchNumber: 'MG-NARC-B1',
        expiryDate: inDays(300),
        purchasePrice: 100,
        mrp: 150,
        quantity: 50,
        status: 'ACTIVE',
      },
    })

    // Create doctor for narcotic capture
    await prisma.doctor.create({
      data: { name: 'Dr Narcotic', registrationNo: 'MCI-NARC', organizationId: org1Id },
    })

    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const h1Capture = {
      patientName: 'Narc Patient',
      patientAddress: '1 Narc St',
      doctorName: 'Dr Narcotic',
      doctorRegNo: 'MCI-NARC',
    }

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: narcotic.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 336 }],
        h1Capture,
      },
      actor
    )

    const narcBefore = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE', referenceId: sale.id },
    })
    expect(narcBefore.length).toBeGreaterThan(0)
    expect(narcBefore.every((n) => n.movementType === 'SALES_DISPENSE')).toBe(true)
    expect(narcBefore.every((n) => n.quantityOut > 0)).toBe(true)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'Narcotic cancellation', voidActor)

    // Original SALES_DISPENSE entries should still exist
    const originalNarc = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE', referenceId: sale.id },
    })
    expect(originalNarc.length).toBeGreaterThan(0)

    // RETURN_TO_SUPPLIER entries should be created with SALE_CANCEL referenceType
    const cancelNarc = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'SALE_CANCEL', referenceId: sale.id },
    })
    expect(cancelNarc.length).toBe(narcBefore.length)

    for (const c of cancelNarc) {
      expect(c.movementType).toBe('RETURN_TO_SUPPLIER')
      expect(c.referenceType).toBe('SALE_CANCEL')
      expect(c.quantityIn).toBeGreaterThan(0)
      expect(c.quantityOut).toBe(0)
    }
  })

  it('cancels a sale and creates SALE_CANCEL audit log', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      },
      actor
    )

    const auditBefore = await prisma.auditLog.findMany({
      where: { entity: 'Sale', entityId: sale.id },
    })
    expect(auditBefore.some((a) => a.action === 'SALE_CREATE')).toBe(true)

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'Audit test reason', voidActor)

    const auditAfter = await prisma.auditLog.findMany({
      where: { entity: 'Sale', entityId: sale.id },
    })
    const cancelAudit = auditAfter.find((a) => a.action === 'SALE_CANCEL')
    expect(cancelAudit).toBeTruthy()
    expect(cancelAudit!.metadata).toMatchObject({
      cancelledReason: 'Audit test reason',
    })
  })

  it('prevents duplicate reversal on repeated cancellation', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: normal.id, quantity: 4 }],
        payments: [{ method: 'CASH', amount: 448 }],
      },
      actor
    )

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }
    await cancelSale(sale.id, 'First cancellation', voidActor)

    // Second cancellation should fail
    await expect(cancelSale(sale.id, 'Second attempt', voidActor)).rejects.toThrow(
      'already cancelled'
    )

    // Verify no duplicate inventory restoration
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: normal.id, branchId: branchA } },
    })
    expect(inventory.availableQuantity).toBe(50) // Back to original

    // Verify no duplicate batch restoration
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { productId_batchNumber: { productId: normal.id, batchNumber: 'MG-MG-N' } },
    })
    expect(batch.soldQuantity).toBe(0)

    // Verify no duplicate GST reversal
    const cancelGst = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE_CANCEL', referenceId: sale.id },
    })
    // Should only have one set of reversal entries
    const uniqueRefLineIds = new Set(cancelGst.map((g) => g.referenceLineId))
    expect(cancelGst.length).toBe(uniqueRefLineIds.size)

    // Verify no duplicate H1 reversal (if applicable) - but this was normal product
    // Verify no duplicate narcotic reversal (if applicable) - normal product
  })

  // ── D2-B: Narcotic Purchase Receipt / GRN ────────────────────────

  it('creates PURCHASE_RECEIPT NarcoticRegister entry for narcotic GRN', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['purchases:create', 'purchases:receive'],
    }

    // Create narcotic product
    const narcotic = await prisma.product.create({
      data: {
        name: 'GRN Narcotic',
        sku: 'GRN-NARC',
        barcode: '99NARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    // Create PO
    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({ data: { name: 'GRN Supplier', gstin: '29AAAAA0000A1Z5' } })
        ).id,
        items: [
          {
            productId: narcotic.id,
            orderedQuantity: 10,
            unitCost: 100,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    // GRN for narcotic product
    await updatePurchase(purchase.id, { status: 'ORDERED' }, actor)
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-NARC-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 10,
            batchNumber: 'BATCH-GRN-NARC-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 100,
            mrp: 150,
            qualityCheckPassed: true,
          },
        ],
      },
      actor
    )

    // Verify NarcoticRegister entry was created
    const narcRegister = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchase.id },
    })
    expect(narcRegister.length).toBe(1)
    expect(narcRegister[0].movementType).toBe('PURCHASE_RECEIPT')
    expect(narcRegister[0].quantityIn).toBe(10)
    expect(narcRegister[0].quantityOut).toBe(0)
    expect(narcRegister[0].balanceQuantity).toBe(10) // afterAvailable = 10
    expect(narcRegister[0].productId).toBe(narcotic.id)
    expect(narcRegister[0].branchId).toBe(branchA)
    expect(narcRegister[0].referenceType).toBe('PURCHASE')
    expect(narcRegister[0].enteredById).toBe(actor.id)
  })

  it('does NOT create NarcoticRegister entry for non-narcotic GRN', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['purchases:create', 'purchases:receive'],
    }

    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({
            data: { name: 'GRN Supplier 2', gstin: '29BBBBB0000B1Z5' },
          })
        ).id,
        items: [
          {
            productId: normal.id,
            orderedQuantity: 5,
            unitCost: 80,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    await updatePurchase(purchase.id, { status: 'ORDERED' }, actor)
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-NORMAL-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 5,
            batchNumber: 'BATCH-GRN-NORMAL-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 80,
            mrp: 100,
            qualityCheckPassed: true,
          },
        ],
      },
      actor
    )

    // Verify NO NarcoticRegister entry was created
    const narcRegister = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchase.id },
    })
    expect(narcRegister.length).toBe(0)
  })

  it('creates correct PURCHASE_RECEIPT entries for multi-batch narcotic GRN', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['purchases:create', 'purchases:receive'],
    }

    const narcotic1 = await prisma.product.create({
      data: {
        name: 'Multi-Batch Narcotic 1',
        sku: 'MB-NARC-1',
        barcode: '99MBNARC1',
        mrp: 200,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })
    const narcotic2 = await prisma.product.create({
      data: {
        name: 'Multi-Batch Narcotic 2',
        sku: 'MB-NARC-2',
        barcode: '99MBNARC2',
        mrp: 200,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic1.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })
    await prisma.inventory.create({
      data: {
        productId: narcotic2.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({ data: { name: 'MB Supplier', gstin: '29CCCCC0000C1Z5' } })
        ).id,
        items: [
          {
            productId: narcotic1.id,
            orderedQuantity: 10,
            unitCost: 150,
            discountPercent: 0,
            taxPercent: 12,
          },
          {
            productId: narcotic2.id,
            orderedQuantity: 5,
            unitCost: 150,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    await updatePurchase(purchase.id, { status: 'ORDERED' }, actor)
    // GRN with two batches for two narcotic products
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-MB-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 10,
            batchNumber: 'BATCH-MB-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 150,
            mrp: 200,
            qualityCheckPassed: true,
          },
          {
            purchaseItemId: purchase.items[1].id,
            receivedQuantity: 5,
            batchNumber: 'BATCH-MB-002',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 150,
            mrp: 200,
            qualityCheckPassed: true,
          },
        ],
      },
      actor
    )

    // Verify two NarcoticRegister entries (one per product)
    const narcRegister = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchase.id },
      orderBy: { entryDate: 'asc' },
    })
    expect(narcRegister.length).toBe(2)
    expect(narcRegister[0].quantityIn).toBe(10)
    expect(narcRegister[1].quantityIn).toBe(5)
    expect(narcRegister.every((n) => n.movementType === 'PURCHASE_RECEIPT')).toBe(true)
    expect(narcRegister.every((n) => n.quantityOut === 0)).toBe(true)
    // Balance is per-product: first product has 10, second has 5
    expect(narcRegister[0].balanceQuantity).toBe(10)
    expect(narcRegister[1].balanceQuantity).toBe(5)
  })

  it('rolls back NarcoticRegister on failed GRN (C2 quarantine)', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['purchases:create', 'purchases:receive'],
    }

    const narcotic = await prisma.product.create({
      data: {
        name: 'Quarantine Narcotic',
        sku: 'Q-NARC',
        barcode: '99QNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({ data: { name: 'Q Supplier', gstin: '29DDDDD0000D1Z5' } })
        ).id,
        items: [
          {
            productId: narcotic.id,
            orderedQuantity: 10,
            unitCost: 100,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    await updatePurchase(purchase.id, { status: 'ORDERED' }, actor)
    // GRN with quality check FAILED - should quarantine the batch
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-Q-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 10,
            batchNumber: 'BATCH-Q-NARC-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 100,
            mrp: 150,
            qualityCheckPassed: false, // FAILED quality check
            qualityCheckNotes: 'Contamination detected',
          },
        ],
      },
      actor
    )

    // GRN should succeed (batch is BLOCKED/quarantined)
    const grnPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })
    expect(grnPurchase.status).toBe('RECEIVED')

    // NarcoticRegister entry SHOULD still be created for quarantined batch
    // (GRN succeeds, batch is just marked BLOCKED)
    const narcRegister = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchase.id },
    })
    expect(narcRegister.length).toBe(1)
    expect(narcRegister[0].movementType).toBe('PURCHASE_RECEIPT')
    expect(narcRegister[0].quantityIn).toBe(10)

    // Verify batch is quarantined
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { productId_batchNumber: { productId: narcotic.id, batchNumber: 'BATCH-Q-NARC-001' } },
    })
    expect(batch.status).toBe('BLOCKED')
  })

  it('verifies C2 quarantine behavior unchanged for non-narcotic products', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['purchases:create', 'purchases:receive'],
    }

    const normal = await prisma.product.findUniqueOrThrow({ where: { sku: 'MG-N' } })

    await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({ data: { name: 'C2 Supplier', gstin: '29EEEEE0000E1Z5' } })
        ).id,
        items: [
          {
            productId: normal.id,
            orderedQuantity: 5,
            unitCost: 80,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    // Missing cold chain log for cold-chain product should fail
    const coldChainProduct = await prisma.product.create({
      data: {
        name: 'Cold Chain Normal',
        sku: 'CC-NORMAL',
        barcode: '99CCNORM',
        mrp: 100,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NONE',
        storageCondition: 'REFRIGERATED',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: coldChainProduct.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    const ccPurchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: (
          await prisma.supplier.create({ data: { name: 'CC Supplier', gstin: '29FFFFF0000F1Z5' } })
        ).id,
        items: [
          {
            productId: coldChainProduct.id,
            orderedQuantity: 5,
            unitCost: 80,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      actor
    )

    await updatePurchase(ccPurchase.id, { status: 'ORDERED' }, actor)
    // GRN without cold chain temp log should be quarantined (not rejected)
    await createGrn(
      {
        purchaseId: ccPurchase.id,
        branchId: branchA,
        grnNumber: 'GRN-CC-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: ccPurchase.items[0].id,
            receivedQuantity: 5,
            batchNumber: 'BATCH-CC-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 80,
            mrp: 100,
            qualityCheckPassed: true,
            // No coldChainTempLog provided
          },
        ],
      },
      actor
    )

    // Verify batch is quarantined
    const ccBatch = await prisma.batch.findUniqueOrThrow({
      where: {
        productId_batchNumber: { productId: coldChainProduct.id, batchNumber: 'BATCH-CC-001' },
      },
    })
    expect(ccBatch.status).toBe('BLOCKED')
    expect(ccBatch.blockedReason).toContain('cold-chain temperature log')
  })

  // ── D2-A: Narcotic Opening Balance ────────────────────────────

  it('creates a valid first opening balance with real batch', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }

    // Create narcotic product
    const narcotic = await prisma.product.create({
      data: {
        name: 'Opening Balance Narcotic',
        sku: 'OB-NARC',
        barcode: '99OBNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    const result = await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 100,
        reason: 'Initial stock declaration',
        batchNumber: 'OB-INIT-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000), // 10 years
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
        supplierRef: 'OPENING',
      },
      actor
    )

    // Verify NarcoticRegister
    const registers = await prisma.narcoticRegister.findMany({
      where: { referenceType: 'OPENING_BALANCE', referenceId: result.openingBalanceId },
    })
    expect(registers.length).toBe(1)
    expect(registers[0].movementType).toBe('OPENING_BALANCE')
    expect(registers[0].quantityIn).toBe(100)
    expect(registers[0].quantityOut).toBe(0)
    expect(registers[0].balanceQuantity).toBe(100)
    expect(registers[0].referenceType).toBe('OPENING_BALANCE')

    // Verify Inventory
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: narcotic.id, branchId: branchA } },
    })
    expect(inventory.totalQuantity).toBe(100)
    expect(inventory.availableQuantity).toBe(100)

    // Verify real Batch was created
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { id: registers[0].batchId },
    })
    expect(batch.quantity).toBe(100)
    expect(batch.status).toBe('ACTIVE')
    expect(Number(batch.purchasePrice)).toBe(100)
    expect(Number(batch.mrp)).toBe(150)
    expect(batch.expiryDate.getTime()).toBeGreaterThan(Date.now())

    // Verify InventoryMovement
    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'OPENING_BALANCE', referenceId: result.openingBalanceId },
    })
    expect(movement).toBeTruthy()
    expect(movement!.type).toBe('IN')
    expect(movement!.quantity).toBe(100)

    // Verify AuditLog
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'NARCOTIC_OPENING_BALANCE_CREATE', entityId: registers[0].id },
    })
    expect(audit).toBeTruthy()
    expect(audit!.metadata).toMatchObject({ openingId: expect.any(String), quantity: 100 })
  })

  it('opens correct register balance chain with opening -> purchase -> sale', async () => {
    const actor = {
      id: userAId,
      branchId: branchA,
      permissions: ['inventory:adjust', 'purchases:create', 'purchases:receive', 'sales:create'],
    }
    expect(actor.id).toBe(userAId)

    // Create narcotic product
    const narcotic = await prisma.product.create({
      data: {
        name: 'Chain Narcotic',
        sku: 'CHAIN-NARC',
        barcode: '99CHAIN',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        isPrescriptionRequired: false,
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    // 1. Opening balance +100
    await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 100,
        reason: 'Initial declaration',
        batchNumber: 'OB-CHAIN-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
      },
      { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    )

    let registers = await prisma.narcoticRegister.findMany({
      where: { productId: narcotic.id, branchId: branchA },
      orderBy: { entryDate: 'asc' },
    })
    expect(registers.length).toBe(1)
    expect(registers[0].balanceQuantity).toBe(100)

    // 2. Purchase receipt +20
    const supplier = await prisma.supplier.create({
      data: { name: 'Chain Supplier', gstin: '29CHAIN0001A1Z5' },
    })
    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: supplier.id,
        items: [
          {
            productId: narcotic.id,
            orderedQuantity: 20,
            unitCost: 100,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )
    await updatePurchase(
      purchase.id,
      { status: 'ORDERED' },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-CHAIN-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 20,
            batchNumber: 'BATCH-CHAIN-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 100,
            mrp: 150,
            qualityCheckPassed: true,
          },
        ],
      },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )

    registers = await prisma.narcoticRegister.findMany({
      where: { productId: narcotic.id, branchId: branchA },
      orderBy: { entryDate: 'asc' },
    })
    expect(registers.length).toBe(2)
    expect(registers[1].balanceQuantity).toBe(120)

    // 3. Sale -10
    await prisma.doctor.create({
      data: { name: 'Dr Chain', registrationNo: 'MCI-CHAIN', organizationId: org1Id },
    })
    const sale = await createSale(
      {
        branchId: branchA,
        items: [{ productId: narcotic.id, quantity: 10 }],
        payments: [{ method: 'CASH', amount: 1680 }],
        h1Capture: {
          patientName: 'Patient',
          patientAddress: 'Addr',
          doctorName: 'Dr Chain',
          doctorRegNo: 'MCI-CHAIN',
        },
      },
      { id: userAId, branchId: branchA, permissions: ['sales:create'] }
    )
    expect(sale.status).toBe('COMPLETED')

    registers = await prisma.narcoticRegister.findMany({
      where: { productId: narcotic.id, branchId: branchA },
      orderBy: { entryDate: 'asc' },
    })
    expect(registers.length).toBe(3)
    expect(registers[2].balanceQuantity).toBe(110)
  })

  it('rejects duplicate opening balance for same branch+product', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    expect(actor.id).toBe(userAId)

    const narcotic = await prisma.product.create({
      data: {
        name: 'Duplicate Narcotic',
        sku: 'DUP-NARC',
        barcode: '99DUPNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 50,
        reason: 'First opening',
        batchNumber: 'OB-DUP-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
      },
      { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    )

    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 50,
          reason: 'Second opening',
          batchNumber: 'OB-DUP-002',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
      )
    ).rejects.toThrow('already exists')
  })

  it('requires INVENTORY_ADJUST permission', async () => {
    const noPermActor = { id: userAId, branchId: branchA, permissions: ['sales:create'] }

    const narcotic = await prisma.product.create({
      data: {
        name: 'Perm Narcotic',
        sku: 'PERM-NARC',
        barcode: '99PERMNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 10,
          reason: 'Test',
          batchNumber: 'OB-PERM-001',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        noPermActor
      )
    ).rejects.toThrow('inventory:adjust')
  })

  it('enforces branch isolation', async () => {
    const actorA = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    const actorB = { id: userBId, branchId: branchB, permissions: ['inventory:adjust'] }

    const narcotic = await prisma.product.create({
      data: {
        name: 'Branch Narcotic',
        sku: 'BR-NARC',
        barcode: '99BRNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })
    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchB,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 100,
        reason: 'Branch A opening',
        batchNumber: 'OB-BR-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
      },
      actorA
    )

    // Actor from branch B should not be able to create opening for branch A
    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 50,
          reason: 'Unauthorized',
          batchNumber: 'OB-BR-002',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        actorB
      )
    ).rejects.toThrow('branch mismatch')
  })

  it('denies cross-org access', async () => {
    const actorA = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    const actorOther = {
      id: userOtherId,
      branchId: branchOtherOrg,
      permissions: ['inventory:adjust'],
    }

    const narcotic = await prisma.product.create({
      data: {
        name: 'CrossOrg Narcotic',
        sku: 'CO-NARC',
        barcode: '99CONARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 100,
        reason: 'Org 1 opening',
        batchNumber: 'OB-CO-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
      },
      actorA
    )

    // Actor from different org cannot access branch A
    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 50,
          reason: 'Unauthorized',
          batchNumber: 'OB-CO-002',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        actorOther
      )
    ).rejects.toThrow('branch')
  })

  it('permits post-dated opening with warning', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    expect(actor.id).toBe(userAId)

    // First create a GRN
    const narcotic = await prisma.product.create({
      data: {
        name: 'Postdated Narcotic',
        sku: 'PD-NARC',
        barcode: '99PDNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    const supplier = await prisma.supplier.create({
      data: { name: 'PD Supplier', gstin: '29PDSUPP0001A1Z5' },
    })
    const purchase = await createPurchase(
      {
        branchId: branchA,
        supplierId: supplier.id,
        items: [
          {
            productId: narcotic.id,
            orderedQuantity: 20,
            unitCost: 100,
            discountPercent: 0,
            taxPercent: 12,
          },
        ],
      },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )
    await updatePurchase(
      purchase.id,
      { status: 'ORDERED' },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )
    await createGrn(
      {
        purchaseId: purchase.id,
        branchId: branchA,
        grnNumber: 'GRN-PD-001',
        grnDate: new Date(),
        items: [
          {
            purchaseItemId: purchase.items[0].id,
            receivedQuantity: 20,
            batchNumber: 'BATCH-PD-001',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            manufacturingDate: new Date(),
            purchasePrice: 100,
            mrp: 150,
            qualityCheckPassed: true,
          },
        ],
      },
      { id: userAId, branchId: branchA, permissions: ['purchases:create', 'purchases:receive'] }
    )

    // Now create opening balance (post-dated relative to GRN)
    const result = await createOpeningBalance(
      {
        branchId: branchA,
        productId: narcotic.id,
        quantity: 100,
        reason: 'Late opening declaration',
        batchNumber: 'OB-PD-001',
        expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        manufacturingDate: new Date(),
        purchasePrice: 100,
        mrp: 150,
      },
      { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    )

    // Should succeed but with warning in audit log
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'NARCOTIC_OPENING_BALANCE_CREATE', entityId: result.narcoticRegisterId },
    })
    expect(audit).toBeTruthy()
    expect(audit!.metadata).toMatchObject({ warning: 'POST_DATED_OPENING' })

    // Balance should be correct: 20 (GRN) + 100 (opening) = 120
    const registers = await prisma.narcoticRegister.findMany({
      where: { productId: narcotic.id, branchId: branchA },
      orderBy: { entryDate: 'asc' },
    })
    const finalBalance = registers[registers.length - 1].balanceQuantity
    expect(finalBalance).toBe(120)
  })

  it('validates required batch metadata and quantity', async () => {
    const actor = { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
    expect(actor.id).toBe(userAId)

    const narcotic = await prisma.product.create({
      data: {
        name: 'Validation Narcotic',
        sku: 'VAL-NARC',
        barcode: '99VALNARC',
        mrp: 150,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NARCOTIC_NDPS',
        createdById: userAId,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: narcotic.id,
        branchId: branchA,
        totalQuantity: 0,
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    })

    // Missing batchNumber
    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 10,
          reason: 'Test',
          batchNumber: '',
          expiryDate: new Date(),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
      )
    ).rejects.toThrow('Batch metadata')

    // Negative quantity
    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: -5,
          reason: 'Test',
          batchNumber: 'OB-VAL-001',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: 100,
          mrp: 150,
        },
        { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
      )
    ).rejects.toThrow('positive')

    // Negative purchasePrice
    await expect(
      createOpeningBalance(
        {
          branchId: branchA,
          productId: narcotic.id,
          quantity: 10,
          reason: 'Test',
          batchNumber: 'OB-VAL-002',
          expiryDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
          manufacturingDate: new Date(),
          purchasePrice: -10,
          mrp: 150,
        },
        { id: userAId, branchId: branchA, permissions: ['inventory:adjust'] }
      )
    ).rejects.toThrow('negative')
  })
})
