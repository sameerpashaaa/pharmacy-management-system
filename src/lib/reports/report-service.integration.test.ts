/**
 * @jest-environment node
 */
import { addDays } from 'date-fns'

import prisma from '@/lib/db/prisma'
import { ReportService } from '@/lib/reports/report-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

;(HAS_DB ? describe : describe.skip)('ReportService Integration', () => {
  let orgId: string
  let branchId: string
  let productA: { id: string; name: string }
  let productB: { id: string; name: string }

  beforeAll(async () => {
    // Setup test data
    const org = await prisma.organization.create({ data: { name: 'Report Test Org' } })
    orgId = org.id
    const branch = await prisma.branch.create({
      data: { name: 'Report Branch', organizationId: orgId },
    })
    branchId = branch.id

    const uniqueId = Date.now().toString()
    await prisma.category.create({
      data: { name: `Report Cat ${uniqueId}`, slug: `report-cat-${uniqueId}` },
    })
    const user = await prisma.user.create({
      data: { email: `test-${uniqueId}@example.com`, name: 'Test' },
    })

    productA = await prisma.product.create({
      data: {
        name: `Report Narcotic ${uniqueId}`,
        sku: `RPT-NARC-${uniqueId}`,
        drugSchedule: 'X',
        mrp: 100,
        createdById: user.id,
      },
    })
    productB = await prisma.product.create({
      data: {
        name: `Report Normal ${uniqueId}`,
        sku: `RPT-NRM-${uniqueId}`,
        drugSchedule: 'NONE',
        mrp: 50,
        createdById: user.id,
      },
    })

    // Inventories
    const invA = await prisma.inventory.create({
      data: {
        branchId,
        productId: productA.id,
        totalQuantity: 50,
        availableQuantity: 50,
      },
    })
    const invB = await prisma.inventory.create({
      data: {
        branchId,
        productId: productB.id,
        totalQuantity: 20,
        availableQuantity: 20,
      },
    })

    // Batches
    await prisma.batch.create({
      data: {
        productId: productB.id,
        branchId,
        batchNumber: 'EXP-SOON',
        quantity: 10,
        expiryDate: addDays(new Date(), 10), // Expires in 10 days
        purchasePrice: 40,
        mrp: 50,
      },
    })

    // Movements
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: invA.id,
        type: 'IN',
        quantity: 50,
        quantityBefore: 0,
        quantityAfter: 50,
        referenceType: 'PURCHASE',
      },
    })
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: invB.id,
        type: 'OUT',
        quantity: 5,
        quantityBefore: 25,
        quantityAfter: 20,
        referenceType: 'SALE',
      },
    })

    // Sales
    await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `INV-RPT-${uniqueId}`,
        subtotal: 100,
        totalAmount: 110,
        taxAmount: 10,
        createdById: user.id,
        saleDate: new Date(),
        status: 'COMPLETED',
      },
    })

    // Supplier & Purchase
    const supplier = await prisma.supplier.create({
      data: { name: `Report Supplier ${uniqueId}` },
    })
    await prisma.purchase.create({
      data: {
        purchaseNumber: `PO-RPT-${uniqueId}`,
        branchId,
        supplierId: supplier.id,
        status: 'RECEIVED',
        totalAmount: 500,
        createdById: user.id,
        purchaseDate: new Date(),
      },
    })
  })

  afterAll(async () => {
    // Cleanup is usually handled by jest/prisma setup or we can leave it in test schema
  })

  it('generates daily stock position', async () => {
    const res = await ReportService.getDailyStockPosition(branchId)
    expect(res).toBeDefined()
    expect(res.length).toBeGreaterThanOrEqual(2)
    const pA = res.find((r) => r.productId === productA.id)
    expect(pA?.batchTotal).toBe(50)
    expect(pA?.value).toBe(5000)
  })

  it('generates near expiry report', async () => {
    const res = await ReportService.getNearExpiry(branchId, 30)
    expect(res).toBeDefined()
    expect(res.length).toBeGreaterThanOrEqual(1)
    const exp = res.find((r) => r.batchNumber === 'EXP-SOON')
    expect(exp).toBeDefined()
    expect(exp?.daysToExpiry).toBeLessThanOrEqual(10)
  })

  it('generates narcotic register', async () => {
    const res = await ReportService.getNarcoticRegister(branchId)
    expect(res).toBeDefined()
    // Should contain movements for productA (Schedule X)
    const narc = res.find((r) => r.productName === productA.name)
    expect(narc).toBeDefined()
    expect(narc?.type).toBe('IN')
  })

  it('generates consumption report', async () => {
    const d = new Date()
    const res = await ReportService.getConsumptionReport(branchId, addDays(d, -1), addDays(d, 1))
    expect(res).toBeDefined()
    const cons = res.find((r) => r.productName === productB.name)
    expect(cons).toBeDefined()
    expect(cons?.totalConsumed).toBe(5)
    expect(cons?.salesConsumed).toBe(5)
  })

  it('generates supplier performance report', async () => {
    const d = new Date()
    const res = await ReportService.getSupplierPerformance(branchId, addDays(d, -1), addDays(d, 1))
    expect(res).toBeDefined()
    const sup = res.find((r) => r.supplierName.startsWith('Report Supplier'))
    expect(sup).toBeDefined()
    expect(sup?.totalPurchases).toBe(1)
    expect(sup?.completedPurchases).toBe(1)
    expect(sup?.fulfillmentRate).toBe(100)
  })

  it('generates sales and financial report', async () => {
    const d = new Date()
    const res = await ReportService.getSalesFinancials(branchId, addDays(d, -1), addDays(d, 1))
    expect(res).toBeDefined()
    expect(res.totalSalesCount).toBeGreaterThanOrEqual(1)
    expect(res.totalRevenue).toBeGreaterThanOrEqual(110)
    expect(res.dailyBreakdown.length).toBeGreaterThanOrEqual(1)
  })
})
