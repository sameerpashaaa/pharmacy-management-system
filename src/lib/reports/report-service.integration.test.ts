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
    expect(res.data.length).toBeGreaterThanOrEqual(2)
    expect(res.total).toBeGreaterThanOrEqual(2)
    const pA = res.data.find((r) => r.productId === productA.id)
    expect(pA?.batchTotal).toBe(50)
    expect(pA?.value).toBe(5000)
  })

  it('paginates the stock position without truncating the total', async () => {
    const first = await ReportService.getDailyStockPosition(branchId, { page: 1, limit: 1 })
    expect(first.data.length).toBe(1)
    expect(first.total).toBeGreaterThanOrEqual(2)
    const beyond = await ReportService.getDailyStockPosition(branchId, {
      page: 99999,
      limit: 10,
    })
    expect(beyond.data).toHaveLength(0)
    expect(beyond.total).toBe(first.total)
  })

  it('generates near expiry report', async () => {
    const res = await ReportService.getNearExpiry(branchId, 30)
    expect(res).toBeDefined()
    expect(res.data.length).toBeGreaterThanOrEqual(1)
    const exp = res.data.find((r) => r.batchNumber === 'EXP-SOON')
    expect(exp).toBeDefined()
    expect(exp?.daysToExpiry).toBeLessThanOrEqual(10)
  })

  it('generates narcotic register from the authoritative NarcoticRegister rows', async () => {
    const uniqueId = Date.now().toString()
    const user = await prisma.user.create({
      data: { email: `nr-${uniqueId}@example.com`, name: 'NR' },
    })
    const product = await prisma.product.create({
      data: {
        name: `Report NDPS ${uniqueId}`,
        sku: `RPT-NDPS-${uniqueId}`,
        drugSchedule: 'NARCOTIC_NDPS',
        mrp: 100,
        createdById: user.id,
      },
    })
    await prisma.inventory.create({
      data: { branchId, productId: product.id, totalQuantity: 30, availableQuantity: 30 },
    })
    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        branchId,
        batchNumber: `NDPS-B${uniqueId}`,
        quantity: 30,
        expiryDate: addDays(new Date(), 400),
        purchasePrice: 60,
        mrp: 100,
      },
    })
    await prisma.narcoticRegister.create({
      data: {
        branchId,
        productId: product.id,
        batchId: batch.id,
        movementType: 'PURCHASE_RECEIPT',
        quantityIn: 30,
        quantityOut: 0,
        balanceQuantity: 30,
        referenceType: 'PURCHASE',
        referenceId: `PO-NR-${uniqueId}`,
        entryDate: new Date(),
        enteredById: user.id,
      },
    })
    const res = await ReportService.getNarcoticRegister(branchId)
    expect(res).toBeDefined()
    // The report is sourced from NarcoticRegister: the register movement type
    // and the persisted (authoritative) balance are what the consumer sees.
    const narc = res.data.find((r) => r.productId === product.id)
    expect(narc).toBeDefined()
    expect(narc?.movementType).toBe('PURCHASE_RECEIPT')
    expect(narc?.quantityIn).toBe(30)
    expect(narc?.quantityOut).toBe(0)
    expect(narc?.balanceQuantity).toBe(30)
    expect(narc?.drugSchedule).toBe('NARCOTIC_NDPS')
  })

  it('generates consumption report', async () => {
    const d = new Date()
    const res = await ReportService.getConsumptionReport(branchId, addDays(d, -1), addDays(d, 1))
    expect(res).toBeDefined()
    const cons = res.data.find((r) => r.productName === productB.name)
    expect(cons).toBeDefined()
    expect(cons?.totalConsumed).toBe(5)
    expect(cons?.salesConsumed).toBe(5)
  })

  it('excludes purchase-return movements from consumption', async () => {
    const invB = await prisma.inventory.findFirstOrThrow({
      where: { branchId, productId: productB.id },
    })
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: invB.id,
        type: 'OUT',
        quantity: 7,
        quantityBefore: 20,
        quantityAfter: 20,
        referenceType: 'PURCHASE_RETURN',
      },
    })
    const d = new Date()
    const res = await ReportService.getConsumptionReport(branchId, addDays(d, -1), addDays(d, 1))
    const cons = res.data.find((r) => r.productName === productB.name)
    expect(cons?.totalConsumed).toBe(5)
    expect(cons?.salesConsumed).toBe(5)
    expect(cons?.otherConsumed).toBe(0)
  })

  it('generates supplier performance report', async () => {
    const d = new Date()
    const res = await ReportService.getSupplierPerformance(branchId, addDays(d, -1), addDays(d, 1))
    expect(res).toBeDefined()
    const sup = res.data.find((r) => r.supplierName.startsWith('Report Supplier'))
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

  it('groups daily sales by business timezone (Asia/Kolkata), not UTC', async () => {
    const uniqueId = Date.now().toString()
    const user = await prisma.user.create({
      data: { email: `tz-${uniqueId}@example.com`, name: 'TZ' },
    })
    // 18:00 UTC = 23:30 IST on May 15; 19:00 UTC = 00:30 IST on May 16
    for (const [suffix, saleDate] of [
      ['a', new Date('2020-05-15T18:00:00.000Z')],
      ['b', new Date('2020-05-15T19:00:00.000Z')],
    ] as const) {
      await prisma.sale.create({
        data: {
          branchId,
          invoiceNumber: `INV-TZ-${uniqueId}-${suffix}`,
          subtotal: 100,
          totalAmount: 100,
          taxAmount: 0,
          createdById: user.id,
          saleDate,
          status: 'COMPLETED',
        },
      })
    }
    const res = await ReportService.getSalesFinancials(
      branchId,
      new Date('2020-05-01T00:00:00.000Z'),
      new Date('2020-05-31T23:59:59.000Z')
    )
    const may15 = res.dailyBreakdown.find((day) => day.date === '2020-05-15')
    const may16 = res.dailyBreakdown.find((day) => day.date === '2020-05-16')
    expect(may15?.salesCount).toBe(1)
    expect(may16?.salesCount).toBe(1)
  })

  it('rounds monetary totals to paise (no float drift)', async () => {
    const uniqueId = Date.now().toString()
    const user = await prisma.user.create({
      data: { email: `prec-${uniqueId}@example.com`, name: 'Prec' },
    })
    const base = addDays(new Date('2020-06-15T12:00:00.000Z'), 0)
    await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `INV-PREC-${uniqueId}-1`,
        subtotal: 100.1,
        totalAmount: 100.1,
        taxAmount: 10.1,
        discountAmount: 0.1,
        createdById: user.id,
        saleDate: base,
        status: 'COMPLETED',
      },
    })
    await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `INV-PREC-${uniqueId}-2`,
        subtotal: 200.2,
        totalAmount: 200.2,
        taxAmount: 20.2,
        discountAmount: 0.2,
        createdById: user.id,
        saleDate: base,
        status: 'COMPLETED',
      },
    })
    const res = await ReportService.getSalesFinancials(
      branchId,
      addDays(base, -1),
      addDays(base, 1)
    )
    expect(res.totalRevenue).toBe(300.3)
    expect(res.totalTax).toBe(30.3)
    expect(res.totalDiscount).toBe(0.3)
  })

  it('excludes returned sales from revenue but reports them explicitly', async () => {
    const uniqueId = Date.now().toString()
    const user = await prisma.user.create({
      data: { email: `ret-${uniqueId}@example.com`, name: 'Ret' },
    })
    const base = new Date()
    const before = await ReportService.getSalesFinancials(
      branchId,
      addDays(base, -1),
      addDays(base, 1)
    )
    await prisma.sale.create({
      data: {
        branchId,
        invoiceNumber: `INV-RET-${uniqueId}`,
        subtotal: 1000,
        totalAmount: 1000,
        taxAmount: 100,
        createdById: user.id,
        saleDate: base,
        status: 'PARTIALLY_RETURNED',
      },
    })
    const after = await ReportService.getSalesFinancials(
      branchId,
      addDays(base, -1),
      addDays(base, 1)
    )
    // Returned sale contributes nothing to revenue (COMPLETED-only convention,
    // matching the dashboard), but the exclusion is explicit, not silent.
    expect(after.totalRevenue).toBe(before.totalRevenue)
    expect(after.excludedSalesCount).toBe(before.excludedSalesCount + 1)
  })
})
