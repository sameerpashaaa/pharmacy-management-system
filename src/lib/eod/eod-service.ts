// ─────────────────────────────────────────────────────────────
// EOD Service — End of Day Data Aggregation
//
// Gathers all metrics for the daily WhatsApp report:
//   • Revenue, bill count, payment method breakdown
//   • Gross profit (revenue – cost of goods sold)
//   • Sales returns for the day
//   • Top 5 products by quantity sold
//   • Low stock count, expiring ≤30 days count
//   • Pending customer dues (credit, balanceDue > 0)
//   • GST collected (CGST + SGST + IGST)
//   • Organization name and owner phone
//
// All queries are scoped to today 00:00:00 → 23:59:59 local time.
// ─────────────────────────────────────────────────────────────
import { startOfDay, endOfDay } from 'date-fns'

import prisma from '@/lib/db/prisma'

export interface EodTopProduct {
  productName: string
  quantity: number
}

export interface EodReportData {
  // Organization
  orgName: string
  ownerPhone: string | null

  // Revenue & Profit
  totalRevenue: number
  costOfGoods: number
  grossProfit: number
  grossMarginPercent: number

  // Sales breakdown
  totalBills: number
  cashSales: number
  cardUpiSales: number
  creditSales: number
  otherSales: number
  returnsToday: number

  // Top products
  topProducts: EodTopProduct[]

  // Alerts
  lowStockCount: number
  expiringIn30DaysCount: number
  pendingDues: number

  // GST
  cgstCollected: number
  sgstCollected: number
  igstCollected: number
  totalGstCollected: number

  // Date
  reportDate: Date
}

export async function getEodReportData(date: Date = new Date()): Promise<EodReportData> {
  const dayStart = startOfDay(date)
  const dayEnd = endOfDay(date)

  const todayWhere = {
    status: 'COMPLETED' as const,
    saleDate: { gte: dayStart, lte: dayEnd },
  }

  const [
    org,
    salesAggregate,
    paymentBreakdown,
    returnsAggregate,
    topProductsRaw,
    lowStockCount,
    expiringCount,
    pendingDues,
    gstData,
    saleItemsForCogs,
  ] = await Promise.all([
    // Organization info
    prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { name: true, phone: true },
    }),

    // Total revenue & bill count
    prisma.sale.aggregate({
      where: todayWhere,
      _sum: { totalAmount: true },
      _count: { id: true },
    }),

    // Payment method breakdown
    prisma.payment.groupBy({
      by: ['method'],
      where: {
        sale: todayWhere,
      },
      _sum: { amount: true },
    }),

    // Returns today (completed sale returns)
    prisma.saleReturn.aggregate({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { totalAmount: true },
    }),

    // Top 5 products by quantity
    prisma.saleItem.groupBy({
      by: ['productName'],
      where: { sale: todayWhere },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),

    // Low stock count
    prisma.inventory.count({
      where: { availableQuantity: { lte: 10 } },
    }),

    // Expiring batches within 30 days
    prisma.batch.count({
      where: {
        status: 'ACTIVE',
        quantity: { gt: 0 },
        expiryDate: {
          gte: dayStart,
          lte: new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Pending customer dues (sales with balanceDue > 0)
    prisma.sale.aggregate({
      where: {
        balanceDue: { gt: 0 },
        status: 'COMPLETED',
      },
      _sum: { balanceDue: true },
    }),

    // GST collected today via GstTransaction
    prisma.gstTransaction.aggregate({
      where: {
        referenceType: 'SALE',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: {
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
    }),

    // Sale items for COGS calculation (purchasePrice from batch link)
    prisma.saleItem.findMany({
      where: { sale: todayWhere },
      select: {
        quantity: true,
        looseUnits: true,
        itemBatches: {
          select: {
            quantity: true,
            batch: {
              select: { purchasePrice: true },
            },
          },
        },
      },
    }),
  ])

  // ── Compute COGS ──────────────────────────────────────────────
  let costOfGoods = 0
  for (const item of saleItemsForCogs) {
    for (const sib of item.itemBatches) {
      const purchasePrice = Number(sib.batch?.purchasePrice ?? 0)
      const qty = Number(sib.quantity ?? 0)
      costOfGoods += purchasePrice * qty
    }
  }

  // ── Revenue ───────────────────────────────────────────────────
  const totalRevenue = Number(salesAggregate._sum.totalAmount ?? 0)
  const totalBills = salesAggregate._count.id

  // ── Payment breakdown ─────────────────────────────────────────
  let cashSales = 0
  let cardUpiSales = 0
  let creditSales = 0
  let otherSales = 0

  for (const p of paymentBreakdown) {
    const amt = Number(p._sum.amount ?? 0)
    if (p.method === 'CASH') cashSales += amt
    else if (p.method === 'CARD' || p.method === 'UPI') cardUpiSales += amt
    else if (p.method === 'CREDIT') creditSales += amt
    else otherSales += amt
  }

  // ── Profit ────────────────────────────────────────────────────
  const grossProfit = totalRevenue - costOfGoods
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // ── Returns ───────────────────────────────────────────────────
  const returnsToday = Number(returnsAggregate._sum.totalAmount ?? 0)

  // ── Top products ──────────────────────────────────────────────
  const topProducts: EodTopProduct[] = topProductsRaw.map((p) => ({
    productName: p.productName,
    quantity: Number(p._sum.quantity ?? 0),
  }))

  // ── GST ───────────────────────────────────────────────────────
  const cgstCollected = Number(gstData._sum.cgstAmount ?? 0)
  const sgstCollected = Number(gstData._sum.sgstAmount ?? 0)
  const igstCollected = Number(gstData._sum.igstAmount ?? 0)
  const totalGstCollected = cgstCollected + sgstCollected + igstCollected

  // ── Pending dues ─────────────────────────────────────────────
  const pendingDuesTotal = Number(pendingDues._sum.balanceDue ?? 0)

  return {
    orgName: org?.name ?? 'PharmaCare',
    ownerPhone: org?.phone ?? null,
    totalRevenue,
    costOfGoods,
    grossProfit,
    grossMarginPercent,
    totalBills,
    cashSales,
    cardUpiSales,
    creditSales,
    otherSales,
    returnsToday,
    topProducts,
    lowStockCount,
    expiringIn30DaysCount: expiringCount,
    pendingDues: pendingDuesTotal,
    cgstCollected,
    sgstCollected,
    igstCollected,
    totalGstCollected,
    reportDate: date,
  }
}
