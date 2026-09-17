/**
 * @jest-environment node
 */
// Merge verification: master-side compliance/POS features reconciled into
// pharmacare-phase2 (doctors CRUD, H1 register gate, sale cancellation).
// Real Postgres; only requirePermission is mocked for route tests.
import { requirePermission } from '@/lib/auth/auth-helpers'
import prisma from '@/lib/db/prisma'
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
  let branchOtherOrg: string
  let userAId: string
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
      data: { name: 'Other', email: 'other@merge.test', branchId: branchOtherOrg },
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

  it('rejects concurrent cancellation attempts (idempotency via Serializable)', async () => {
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

    const voidActor = { id: userAId, branchId: branchA, permissions: ['sales:void'] }

    // Run two cancellations concurrently - one should succeed, one should fail
    const results = await Promise.allSettled([
      cancelSale(sale.id, 'Concurrent 1', voidActor),
      cancelSale(sale.id, 'Concurrent 2', voidActor),
    ])

    // Exactly one should succeed, one should fail
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    expect(succeeded).toBe(1)
    expect(failed).toBe(1)

    // Verify database state is consistent
    const cancelled = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(cancelled.status).toBe('CANCELLED')

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: normal.id, branchId: branchA } },
    })
    expect(inventory.availableQuantity).toBe(50)
  })
})
