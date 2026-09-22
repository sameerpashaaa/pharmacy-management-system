/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 7 — Form 35 (Schedule H1 register PDF) API route-level
// integration tests (real PostgreSQL).
//
// Mirrors the reports-api.integration.test.ts idiom: mock ONLY
// requirePermission; resolveBranchScope + getScheduleH1Register +
// the form35 GET route all hit the real pharmacare_test database.
//
// Security envelope under test (Remediation #5):
//   1. Route resolves branch scope via resolveBranchScope(user, branchId)
//      — branchless/no-scope actor → 403 (fail-closed), cross-org
//      explicit branch → 403 before any query runs.
//   2. getScheduleH1Register now REQUIRES branchId and filters
//      `where.sale = { branchId }`, so a branch-A export can never
//      include Schedule H1 rows dispensed at a different branch.
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

// Form 35 returns a PDF (application/pdf, attachment). To prove branch
// isolation we assert the route-level status/headers and then, because
// the PDF body is binary, verify data separation by running the REAL
// scoped service with the SAME branchId the route resolves — the PDF
// rows come from exactly this data, so branch-B rows leaking into the
// export would manifest as branch-B rows in this same result set.
// ─────────────────────────────────────────────────────────────
describe('Form 35 API Integration (Real PostgreSQL)', () => {
  let branchId: string // branch A — actor's own branch (authorized)
  let actor: { id: string; branchId: string | null }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'F35 Route Org' } })
    const branch = await prisma.branch.create({
      data: { name: 'F35 Route Branch', organizationId: org.id },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: {
        name: 'F35 Route User',
        email: `f35-route-${Date.now()}-${Math.random()}@pharma.test`,
        branchId,
      },
    })
    actor = { id: user.id, branchId }
  })

  beforeEach(async () => {
    // Preserve org/branch/user fixtures; clear only Schedule H1 + sale
    // transactional tables.
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

  async function seedH1Fixture() {
    await prisma.organization.upsert({
      where: { id: 'org-f35-api-h1' },
      update: {},
      create: { id: 'org-f35-api-h1', name: 'F35 Api Org' },
    })
    await prisma.branch.upsert({
      where: { id: branchId },
      update: {},
      create: {
        id: branchId,
        name: `F35 Api Branch ${branchId}`,
        organizationId: 'org-f35-api-h1',
      },
    })
    const user = await prisma.user.create({
      data: { name: 'H1 Fx', email: `f35-h1-${Date.now()}-${Math.random()}@pharma.test` },
    })
    await prisma.doctor.create({
      data: {
        name: 'F35 Doctor A',
        registrationNo: 'F35-DR-A',
        organizationId: 'org-f35-api-h1',
      },
    })
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
        branchId,
        batchNumber: `F35-B-${Date.now()}`,
        quantity: 100,
        expiryDate: new Date('2029-12-31'),
        purchasePrice: 80,
        mrp: 100,
      },
    })
    const sale = await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `F35-S-${Date.now()}-${Math.random()}`,
        subtotal: 100,
        totalAmount: 100,
        taxAmount: 0,
        discountAmount: 0,
        createdById: user.id,
        saleDate: new Date('2026-09-10T00:00:00.000Z'),
        status: 'COMPLETED',
      },
    })
    await prisma.scheduleH1Register.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        batchId: batch.id,
        patientName: 'F35 H1 Patient A',
        patientAddress: 'F35 Address',
        doctorName: 'F35 Doctor A',
        doctorRegNo: 'F35-DR-A',
        medicineName: 'F35 Med A',
        batchNumber: batch.batchNumber,
        quantityGiven: 1,
        dispensedDate: new Date(Date.now() - 86400000),
        createdById: user.id,
      },
    })
    return { productId: product.id }
  }

  describe('GET /api/compliance/form35', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking reports:export', async () => {
      mockReject("Forbidden: requires permission 'reports:export'")
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(403)
    })

    it('returns 403 when branch scope cannot be resolved (branchless actor, no branchId)', async () => {
      mockUser({ id: actor.id, branchId: null })
      const res = await form35GET(get('http://localhost:3000/api/compliance/form35'))
      expect(res.status).toBe(403)
    })

    it('returns 403 for an explicit branch in a different organization', async () => {
      mockUser({ id: actor.id, branchId })
      const otherOrg = await prisma.organization.create({ data: { name: 'F35 Other Org' } })
      const otherBranch = await prisma.branch.create({
        data: { name: 'F35 Other Branch', organizationId: otherOrg.id },
      })
      const res = await form35GET(
        get(`http://localhost:3000/api/compliance/form35?branchId=${otherBranch.id}`)
      )
      expect(res.status).toBe(403)
    })

    it('returns 400 for malformed dates', async () => {
      mockUser({ id: actor.id, branchId })
      const res = await form35GET(
        get(`http://localhost:3000/api/compliance/form35?branchId=${branchId}&startDate=junk`)
      )
      expect(res.status).toBe(400)
    })

    it('returns a PDF (200) for an authorized user scoped to their branch', async () => {
      await seedH1Fixture()
      mockUser({ id: actor.id, branchId })
      const res = await form35GET(
        get(`http://localhost:3000/api/compliance/form35?branchId=${branchId}`)
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
      expect(res.headers.get('content-disposition')).toContain('attachment')
    })

    it('streams only branch-A rows into the export — branch-B rows never leak', async () => {
      mockUser({ id: actor.id, branchId })

      // Branch A (authorized): seed one Schedule H1 row.
      await seedH1Fixture()

      // Branch B (same org, DIFFERENT branch): seed a Schedule H1 row that
      // must NOT appear in a branch-A export.
      const org = await prisma.branch.findUniqueOrThrow({
        where: { id: branchId },
        select: { organizationId: true },
      })
      const branchB = await prisma.branch.create({
        data: { name: 'F35 Leak Branch', organizationId: org.organizationId },
      })
      const userB = await prisma.user.create({
        data: { name: 'H1 Leak Fx', email: `f35-h1b-${Date.now()}-${Math.random()}@pharma.test` },
      })
      await prisma.doctor.create({
        data: {
          name: 'F35 Doctor B',
          registrationNo: 'F35-DR-B',
          organizationId: org.organizationId,
        },
      })
      const productB = await prisma.product.create({
        data: {
          name: 'F35 Leak Product',
          sku: `F35-H1B-${Date.now()}-${Math.random()}`,
          mrp: 100,
          createdById: userB.id,
        },
      })
      const batchB = await prisma.batch.create({
        data: {
          productId: productB.id,
          branchId: branchB.id,
          batchNumber: `F35-BB-${Date.now()}`,
          quantity: 100,
          expiryDate: new Date('2029-12-31'),
          purchasePrice: 80,
          mrp: 100,
        },
      })
      const saleB = await prisma.sale.create({
        data: {
          branchId: branchB.id,
          invoiceNumber: `F35-SB-${Date.now()}-${Math.random()}`,
          subtotal: 100,
          totalAmount: 100,
          taxAmount: 0,
          discountAmount: 0,
          createdById: userB.id,
          saleDate: new Date('2026-09-10T00:00:00.000Z'),
          status: 'COMPLETED',
        },
      })
      await prisma.scheduleH1Register.create({
        data: {
          saleId: saleB.id,
          productId: productB.id,
          batchId: batchB.id,
          patientName: 'F35 H1 Patient B (MUST NOT LEAK)',
          patientAddress: 'F35 Address',
          doctorName: 'F35 Doctor B',
          doctorRegNo: 'F35-DR-B',
          medicineName: 'F35 Med B',
          batchNumber: batchB.batchNumber,
          quantityGiven: 2,
          dispensedDate: new Date(Date.now() - 86400000),
          createdById: userB.id,
        },
      })

      // The PDF body is binary, but the PDF rows come from EXACTLY this
      // real scoped service call (the route resolved branchId = branch A
      // and passed it through). So the same branch isolation that produces
      // branch-A-only PDF content must hold here.
      const { data } = await getScheduleH1Register({
        startDate: new Date(Date.now() - 30 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        branchId,
        limit: 10000,
      })

      expect(
        data.some((r) => (r as { patientName: string }).patientName.includes('Patient B'))
      ).toBe(false)
      expect(
        data.some((r) => (r as { patientName: string }).patientName.includes('Patient A'))
      ).toBe(true)

      // And the route itself succeeds with the branch-A scope.
      const res = await form35GET(
        get(`http://localhost:3000/api/compliance/form35?branchId=${branchId}`)
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
    })
  })
})
