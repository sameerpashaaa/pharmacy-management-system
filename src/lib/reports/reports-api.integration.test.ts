/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Phase 7 — Reports API route-level integration tests (real PostgreSQL).
//
// The six /api/reports/* routes already delegate to a fully-implemented
// ReportService (getDailyStockPosition, getNearExpiry, getNarcoticRegister,
// getConsumptionReport, getSalesFinancials, getSupplierPerformance).
// The pre-existing unit suite mocks ReportService and the pre-existing
// integration suite calls ReportService directly, so neither verifies the
// route layer: requirePermission + resolveBranchScope + report-params
// parsing + response shape. This suite closes that gap with the real
// route handlers against the isolated pharmacare_test database, mocking
// only requirePermission for auth/RBAC assertions. resolveBranchScope and
// ReportService hit the real database.
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'

import { GET as consumptionGET } from '@/app/api/reports/consumption/route'
import { GET as expiryGET } from '@/app/api/reports/expiry/route'
import { GET as narcoticsGET } from '@/app/api/reports/narcotics/route'
import { GET as salesGET } from '@/app/api/reports/sales/route'
import { GET as stockGET } from '@/app/api/reports/stock/route'
import { GET as supplierGET } from '@/app/api/reports/supplier/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
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
  'purchase_items',
  'purchase_return_items',
  'purchase_returns',
  'purchases',
  'supplier_ledgers',
  'suppliers',
]

const mockRequirePermission = requirePermission as jest.Mock

function mockUser(overrides: { id: string; branchId: string | null }) {
  return mockRequirePermission.mockResolvedValue(overrides)
}

function mockReject(message: string) {
  mockRequirePermission.mockRejectedValue(new Error(message))
}

function get(url: string): NextRequest {
  return new NextRequest(url)
}

describe('Reports API Integration (Real PostgreSQL)', () => {
  let branchId: string
  let actor: { id: string; branchId: string | null }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'Rpt Route Org' } })
    const branch = await prisma.branch.create({
      data: { name: 'Rpt Route Branch', organizationId: org.id },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: {
        name: 'Rpt Route User',
        email: `rpt-route-${Date.now()}@pharma.test`,
        branchId,
      },
    })
    actor = { id: user.id, branchId }
  })

  beforeEach(async () => {
    // Preserve org/branch/user fixtures; clear only transactional report tables.
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

  async function seedSale(opts: {
    invoiceNumber: string
    totalAmount: number
    taxAmount?: number
    discountAmount?: number
  }) {
    return prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: opts.invoiceNumber,
        subtotal: opts.totalAmount,
        totalAmount: opts.totalAmount,
        taxAmount: opts.taxAmount ?? 0,
        discountAmount: opts.discountAmount ?? 0,
        createdById: actor.id,
        saleDate: new Date(),
        status: 'COMPLETED',
      },
    })
  }

  async function seedStockFixture() {
    const user = await prisma.user.create({
      data: { name: 'Stock Fx', email: `rpt-stock-${Date.now()}-${Math.random()}@pharma.test` },
    })
    const product = await prisma.product.create({
      data: {
        name: 'Rpt Stock Product',
        sku: `RPT-STK-${Date.now()}`,
        mrp: 100,
        createdById: user.id,
      },
    })
    await prisma.inventory.create({
      data: { branchId, productId: product.id, totalQuantity: 10, availableQuantity: 10 },
    })
    return { productId: product.id }
  }

  async function seedExpiryFixture() {
    const user = await prisma.user.create({
      data: { name: 'Expiry Fx', email: `rpt-exp-${Date.now()}-${Math.random()}@pharma.test` },
    })
    const product = await prisma.product.create({
      data: {
        name: 'Rpt Expiry Product',
        sku: `RPT-EXP-${Date.now()}`,
        mrp: 50,
        createdById: user.id,
      },
    })
    await prisma.batch.create({
      data: {
        productId: product.id,
        branchId,
        batchNumber: `EXP-${Date.now()}`,
        quantity: 5,
        expiryDate: new Date(Date.now() + 10 * 86400000),
        purchasePrice: 40,
        mrp: 50,
      },
    })
    return { productId: product.id }
  }

  async function seedNarcoticsFixture() {
    const user = await prisma.user.create({
      data: { name: 'Narc Fx', email: `rpt-narc-${Date.now()}-${Math.random()}@pharma.test` },
    })
    const product = await prisma.product.create({
      data: {
        name: 'Rpt Narc Product',
        sku: `RPT-NARC-${Date.now()}`,
        drugSchedule: 'X',
        mrp: 100,
        createdById: user.id,
      },
    })
    const inv = await prisma.inventory.create({
      data: { branchId, productId: product.id, totalQuantity: 20, availableQuantity: 20 },
    })
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        type: 'IN',
        quantity: 20,
        quantityBefore: 0,
        quantityAfter: 20,
        referenceType: 'PURCHASE',
      },
    })
    return { productId: product.id }
  }

  async function seedConsumptionFixture() {
    const user = await prisma.user.create({
      data: { name: 'Cons Fx', email: `rpt-cons-${Date.now()}-${Math.random()}@pharma.test` },
    })
    const product = await prisma.product.create({
      data: {
        name: 'Rpt Cons Product',
        sku: `RPT-CONS-${Date.now()}`,
        mrp: 50,
        createdById: user.id,
      },
    })
    const inv = await prisma.inventory.create({
      data: { branchId, productId: product.id, totalQuantity: 50, availableQuantity: 45 },
    })
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        type: 'OUT',
        quantity: 5,
        quantityBefore: 50,
        quantityAfter: 45,
        referenceType: 'SALE',
      },
    })
    return { productId: product.id }
  }

  async function seedSupplierFixture() {
    const supplier = await prisma.supplier.create({
      data: { name: `Rpt Supplier ${Date.now()}` },
    })
    await prisma.purchase.create({
      data: {
        purchaseNumber: `PO-RPT-${Date.now()}`,
        branchId,
        supplierId: supplier.id,
        totalAmount: 500,
        status: 'RECEIVED',
        createdById: actor.id,
      },
    })
    return { supplierId: supplier.id }
  }

  // ─── GET /api/reports/stock ────────────────────────────────

  describe('GET /api/reports/stock', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await stockGET(get('http://localhost:3000/api/reports/stock'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking reports:inventory', async () => {
      mockReject("Forbidden: requires permission 'reports:inventory'")
      const res = await stockGET(get('http://localhost:3000/api/reports/stock'))
      expect(res.status).toBe(403)
    })

    it('returns 403 when branch scope cannot be resolved', async () => {
      mockUser({ id: actor.id, branchId: null })
      const res = await stockGET(get('http://localhost:3000/api/reports/stock'))
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid pagination', async () => {
      mockUser(actor)
      const res = await stockGET(get('http://localhost:3000/api/reports/stock?page=0&limit=10'))
      expect(res.status).toBe(400)
    })

    it('returns real stock rows with pagination metadata', async () => {
      mockUser(actor)
      const { productId } = await seedStockFixture()
      const res = await stockGET(
        get(`http://localhost:3000/api/reports/stock?branchId=${branchId}&page=1&limit=10`)
      )
      const json = (await res.json()) as {
        success: boolean
        data: { productId: string; productName: string }[]
        pagination: { page: number; limit: number; total: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.pagination).toMatchObject({ page: 1, limit: 10, total: 1 })
      expect(json.data).toHaveLength(1)
      expect(json.data[0].productId).toBe(productId)
    })
  })

  // ─── GET /api/reports/expiry ───────────────────────────────

  describe('GET /api/reports/expiry', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await expiryGET(get('http://localhost:3000/api/reports/expiry'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking reports:inventory', async () => {
      mockReject("Forbidden: requires permission 'reports:inventory'")
      const res = await expiryGET(get('http://localhost:3000/api/reports/expiry'))
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid daysThreshold', async () => {
      mockUser(actor)
      const res = await expiryGET(
        get(`http://localhost:3000/api/reports/expiry?branchId=${branchId}&daysThreshold=junk`)
      )
      expect(res.status).toBe(400)
    })

    it('returns real near-expiry batches', async () => {
      mockUser(actor)
      await seedExpiryFixture()
      const res = await expiryGET(
        get(`http://localhost:3000/api/reports/expiry?branchId=${branchId}&daysThreshold=30`)
      )
      const json = (await res.json()) as {
        success: boolean
        data: { productName: string; daysToExpiry: number }[]
        pagination: { total: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.pagination.total).toBe(1)
      expect(json.data).toHaveLength(1)
      expect(json.data[0].daysToExpiry).toBeLessThanOrEqual(30)
    })
  })

  // ─── GET /api/reports/narcotics ────────────────────────────

  describe('GET /api/reports/narcotics', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await narcoticsGET(get('http://localhost:3000/api/reports/narcotics'))
      expect(res.status).toBe(401)
    })

    it('returns 400 for malformed dates', async () => {
      mockUser(actor)
      const res = await narcoticsGET(
        get(`http://localhost:3000/api/reports/narcotics?branchId=${branchId}&startDate=junk`)
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when startDate is after endDate', async () => {
      mockUser(actor)
      const res = await narcoticsGET(
        get(
          'http://localhost:3000/api/reports/narcotics?startDate=2026-09-10&endDate=2026-09-01&' +
            `branchId=${branchId}`
        )
      )
      expect(res.status).toBe(400)
    })

    it('returns real narcotic register rows', async () => {
      mockUser(actor)
      await seedNarcoticsFixture()
      const res = await narcoticsGET(
        get(`http://localhost:3000/api/reports/narcotics?branchId=${branchId}`)
      )
      const json = (await res.json()) as {
        success: boolean
        data: { productName: string; drugSchedule: string; quantity: number }[]
        pagination: { total: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
      expect(json.data[0].drugSchedule).toBe('X')
      expect(json.data[0].productName).toBe('Rpt Narc Product')
      expect(json.data[0].quantity).toBe(20)
    })
  })

  // ─── GET /api/reports/consumption ──────────────────────────

  describe('GET /api/reports/consumption', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await consumptionGET(get('http://localhost:3000/api/reports/consumption'))
      expect(res.status).toBe(401)
    })

    it('returns 400 for malformed dates', async () => {
      mockUser(actor)
      const res = await consumptionGET(
        get(
          `http://localhost:3000/api/reports/consumption?branchId=${branchId}&startDate=junk&endDate=2026-09-10`
        )
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when startDate is after endDate', async () => {
      mockUser(actor)
      const res = await consumptionGET(
        get(
          'http://localhost:3000/api/reports/consumption?startDate=2026-09-10&endDate=2026-09-01&' +
            `branchId=${branchId}`
        )
      )
      expect(res.status).toBe(400)
    })

    it('returns real consumption rows', async () => {
      mockUser(actor)
      const { productId } = await seedConsumptionFixture()
      const res = await consumptionGET(
        get(
          'http://localhost:3000/api/reports/consumption' +
            `?branchId=${branchId}&startDate=2000-01-01&endDate=2100-01-01`
        )
      )
      const json = (await res.json()) as {
        success: boolean
        data: { productId: string; totalConsumed: number }[]
        pagination: { total: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
      expect(json.data[0].productId).toBe(productId)
      expect(json.data[0].totalConsumed).toBe(5)
    })
  })

  // ─── GET /api/reports/sales ────────────────────────────────

  describe('GET /api/reports/sales', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await salesGET(get('http://localhost:3000/api/reports/sales'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking reports:sales', async () => {
      mockReject("Forbidden: requires permission 'reports:sales'")
      const res = await salesGET(get('http://localhost:3000/api/reports/sales'))
      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid dates', async () => {
      mockUser(actor)
      const res = await salesGET(
        get(`http://localhost:3000/api/reports/sales?branchId=${branchId}&startDate=junk`)
      )
      expect(res.status).toBe(400)
    })

    it('returns real financial summary for the branch', async () => {
      mockUser(actor)
      const tag = Date.now()
      await seedSale({ invoiceNumber: `INV-RPT-R-${tag}-1`, totalAmount: 400, taxAmount: 40 })
      await seedSale({
        invoiceNumber: `INV-RPT-R-${tag}-2`,
        totalAmount: 600,
        taxAmount: 60,
        discountAmount: 50,
      })
      const res = await salesGET(
        get(
          'http://localhost:3000/api/reports/sales' +
            `?branchId=${branchId}&startDate=2000-01-01&endDate=2100-01-01`
        )
      )
      const json = (await res.json()) as {
        success: boolean
        data: { totalSalesCount: number; totalRevenue: number; totalTax: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.totalSalesCount).toBe(2)
      expect(json.data.totalRevenue).toBe(1000)
      expect(json.data.totalTax).toBe(100)
    })
  })

  // ─── GET /api/reports/supplier ─────────────────────────────

  describe('GET /api/reports/supplier', () => {
    it('returns 401 when unauthenticated', async () => {
      mockReject('Unauthorized')
      const res = await supplierGET(get('http://localhost:3000/api/reports/supplier'))
      expect(res.status).toBe(401)
    })

    it('returns 403 when lacking reports:purchases', async () => {
      mockReject("Forbidden: requires permission 'reports:purchases'")
      const res = await supplierGET(get('http://localhost:3000/api/reports/supplier'))
      expect(res.status).toBe(403)
    })

    it('returns real supplier performance rows', async () => {
      mockUser(actor)
      const { supplierId } = await seedSupplierFixture()
      const res = await supplierGET(
        get(
          'http://localhost:3000/api/reports/supplier' +
            `?branchId=${branchId}&startDate=2000-01-01&endDate=2100-01-01`
        )
      )
      const json = (await res.json()) as {
        success: boolean
        data: { supplierId: string; totalAmount: number }[]
        pagination: { total: number }
      }
      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.pagination.total).toBe(1)
      expect(json.data).toHaveLength(1)
      expect(json.data[0].supplierId).toBe(supplierId)
      expect(json.data[0].totalAmount).toBe(500)
    })
  })

  it('requires REPORTS permissions (contract guard)', () => {
    expect(PERMISSIONS.REPORTS_SALES).toBe('reports:sales')
    expect(PERMISSIONS.REPORTS_PURCHASES).toBe('reports:purchases')
    expect(PERMISSIONS.REPORTS_INVENTORY).toBe('reports:inventory')
  })
})
