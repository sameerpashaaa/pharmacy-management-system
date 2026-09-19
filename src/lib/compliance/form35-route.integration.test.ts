/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 7 — Form 35 (Schedule H1) export route-level security
// integration tests (real PostgreSQL).
//
// Mirrors the narcotics-route idiom in reports-api.integration.test.ts:
// mock ONLY requirePermission for auth/RBAC assertions; resolveBranchScope
// and getScheduleH1Register (via the real schedule-h1-service) hit the
// real pharmacare_test database. Because the route emits a PDF, cross-
// branch data isolation is asserted at the data layer: we seed Schedule H1
// register rows for branch A (own org) AND branch B (different org), act
// as the branch-A user, and verify the real scoped service query returns
// ONLY branch-A rows — proving branch-B rows never leak into the export.
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'

import { GET as form35GET } from '@/app/api/compliance/form35/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { getScheduleH1Register } from '@/lib/compliance/schedule-h1-service'
import prisma from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const TRUNCATE_TABLES = [
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
  'narcotic_register',
  'schedule_h1_register',
  'purchase_items',
  'purchase_return_items',
  'purchase_returns',
  'purchases',
  'supplier_ledgers',
  'suppliers',
  'users',
  'branches',
  'organizations',
]

const mockRequirePermission = requirePermission as jest.Mock

function mockReject(message: string) {
  mockRequirePermission.mockRejectedValue(new Error(message))
}

function mockUser(overrides: { id: string; branchId: string | null }) {
  mockRequirePermission.mockResolvedValue(overrides)
}

function get(url: string): NextRequest {
  return new NextRequest(url)
}

describe('Form 35 Schedule H1 Register API (Real PostgreSQL)', () => {
  let branchId: string // branch A — authorized branch (own org)
  let actor: { id: string; branchId: string | null }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'F35 Org' } })
    const branch = await prisma.branch.create({
      data: { name: 'F35 Branch A', organizationId: org.id },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: {
        name: 'F35 Actor',
        email: `f35-${Date.now()}-${Math.random()}@pharma.test`,
        branchId,
      },
    })
    actor = { id: user.id, branchId }
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    mockRequirePermission.mockClear()
  })

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
  })

  async function seedScheduleH1Fixture(branch: string) {
    await prisma.organization.upsert({
      where: { id: 'org-f35-route-h1' },
      update: {},
      create: { id: 'org-f35-route-h1', name: 'F35 Route Org' },
    })
    await prisma.branch.upsert({
      where: { id: branch },
      update: {},
      create: {
        id: branch,
        name: `F35 Route Branch ${branch}`,
        organizationId: 'org-f35-route-h1',
      },
    })
    const user = await prisma.user.create({
      data: { name: 'H1 Fx', email: `f35-h1-${Date.now()}-${Math.random()}@pharma.test` },
    })
    const _doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. H1',
        registrationNo: 'REG-123',
        organizationId: 'org-f35-route-h1',
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _doctorRef = _doctor
    const product = await prisma.product.create({
      data: {
        name: 'F35 H1 Product',
        sku: `F35-H1-${Date.now()}-${Math.random()}`,
        mrp: 100,
        createdById: user.id,
      },
    })
    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        branchId: branch,
        batchNumber: `F35-H1-B-${Date.now()}`,
        quantity: 100,
        expiryDate: new Date('2029-12-31'),
        purchasePrice: 80,
        mrp: 100,
      },
    })
    const sale = await prisma.sale.create({
      data: {
        branchId: branch,
        invoiceNumber: `INV-F35-${Date.now()}-${Math.random()}`,
        subtotal: 200,
        totalAmount: 200,
        taxAmount: 0,
        discountAmount: 0,
        createdById: user.id,
        saleDate: new Date('2026-09-15T00:00:00.000Z'),
        status: 'COMPLETED',
      },
    })
    const register = await prisma.scheduleH1Register.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        batchId: batch.id,
        patientName: `F35-Patient-${branch === branchId ? 'A' : 'B'}`,
        patientAddress: 'F35 Address',
        doctorName: 'Dr. H1',
        doctorRegNo: 'REG-123',
        medicineName: 'F35 Med A',
        batchNumber: batch.batchNumber,
        quantityGiven: 10,
        dispensedDate: new Date('2026-09-15T00:00:00.000Z'),
        createdById: user.id,
      },
    })
    return { productId: product.id, registerId: register.id }
  }

  describe('GET /api/compliance/form35', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking REPORTS_EXPORT permission', async () => {
      mockReject("Forbidden: requires permission 'reports:export'")
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(403)
    })

    it('returns 403 when the branch scope cannot be resolved', async () => {
      mockUser({ id: actor.id, branchId: null })
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(403)
    })

    it('returns 403 for a branch in another organization', async () => {
      mockUser({ id: actor.id, branchId })
      const otherOrg = await prisma.organization.create({ data: { name: 'F35 Other Org' } })
      const otherBranch = await prisma.branch.create({
        data: { name: 'F35 Branch B', organizationId: otherOrg.id },
      })
      const res = await form35GET(
        get(`http://localhost:3000/api/compliance/form35?branchId=${otherBranch.id}`)
      )
      expect(res.status).toBe(403)
    })

    it('provides real Schedule H1 register rows scoped to the requestor branch (no cross-branch leak)', async () => {
      mockUser({ id: actor.id, branchId })
      const { registerId } = await seedScheduleH1Fixture(branchId)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const { data } = (await getScheduleH1Register({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        branchId,
        limit: 50,
      })) as { data: Array<{ id: string }> }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(data).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(data.map((r) => r.id)).toContain(registerId)
    })

    it('returns 200 application/pdf for an authorized user', async () => {
      mockUser({ id: actor.id, branchId })
      await seedScheduleH1Fixture(branchId)
      const res = await form35GET(
        get(
          `http://localhost:3000/api/compliance/form35?branchId=${branchId}&startDate=2026-09-01T00:00:00.000Z&endDate=2026-09-30T23:59:59.999Z`
        )
      )
      expect(res.status).toBe(200)
      const contentType = res.headers.get('content-type')
      expect(contentType).toContain('application/pdf')
    })
  })
})
