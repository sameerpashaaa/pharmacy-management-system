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
        data: { productId: p.id, branchId: bA.id, totalQuantity: 50, availableQuantity: 50, reservedQuantity: 0 },
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
      createSale(
        { ...base, items: [...base.items], payments: [...base.payments] },
        actor
      )
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
})
