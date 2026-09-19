import { addDays } from 'date-fns'

import { prisma } from '@/lib/db/prisma'
import { roundCurrency } from '@/lib/utils/currency'

interface ConsumptionEntry {
  productId: string
  productName: string
  sku: string
  totalConsumed: number
  salesConsumed: number
  otherConsumed: number
}

interface DailySalesEntry {
  date: string
  salesCount: number
  revenue: number
  tax: number
  discount: number
}

export interface ReportPagination {
  page: number
  limit: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
}

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000
const FALLBACK_TIMEZONE = 'Asia/Kolkata'

function normalizePagination(pagination?: ReportPagination): { page: number; limit: number } {
  const page = Math.max(1, Math.floor(pagination?.page ?? DEFAULT_PAGE) || DEFAULT_PAGE)
  const rawLimit = Math.floor(pagination?.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT)
  return { page, limit }
}

function paginate<T>(rows: T[], page: number, limit: number): PaginatedResult<T> {
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
  }
}

/**
 * Resolve the business timezone for a branch via its organization.
 * Falls back to Asia/Kolkata (the schema default).
 */
async function resolveBranchTimezone(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { organization: { select: { timezone: true } } },
  })
  return branch?.organization?.timezone || FALLBACK_TIMEZONE
}

/** Business-day key (YYYY-MM-DD) in the given IANA timezone. */
function toBusinessDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export class ReportService {
  /**
   * Daily Stock Position Report
   */
  static async getDailyStockPosition(branchId: string, pagination?: ReportPagination) {
    const { page, limit } = normalizePagination(pagination)
    const inventory = await prisma.inventory.findMany({
      where: { branchId },
      include: {
        product: true,
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    })

    const rows = inventory.map((inv) => ({
      productId: inv.productId,
      productName: inv.product.name,
      sku: inv.product.sku,
      batchTotal: inv.totalQuantity,
      availableQuantity: inv.availableQuantity,
      reservedQuantity: inv.reservedQuantity,
      mrp: Number(inv.product.mrp),
      value: roundCurrency(inv.availableQuantity * Number(inv.product.mrp)),
    }))
    return { ...paginate(rows, page, limit), page, limit }
  }

  /**
   * Near-Expiry Report
   */
  static async getNearExpiry(
    branchId: string,
    daysThreshold: number = 90,
    pagination?: ReportPagination
  ) {
    const { page, limit } = normalizePagination(pagination)
    const thresholdDate = addDays(new Date(), daysThreshold)

    const batches = await prisma.batch.findMany({
      where: {
        branchId,
        quantity: { gt: 0 },
        expiryDate: {
          lte: thresholdDate,
        },
      },
      include: {
        product: true,
      },
      orderBy: {
        expiryDate: 'asc',
      },
    })

    const rows = batches.map((batch) => ({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      productName: batch.product.name,
      sku: batch.product.sku,
      expiryDate: batch.expiryDate,
      quantity: batch.quantity,
      daysToExpiry: Math.ceil(
        (batch.expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24)
      ),
    }))
    return { ...paginate(rows, page, limit), page, limit }
  }

  /**
   * Narcotic Register
   *
   * The authoritative source for the narcotic report is the persisted NDPS
   * register chain (NarcoticRegister), NOT InventoryMovement. Register rows
   * exist only for NARCOTIC_NDPS products (every register writer is scoped to
   * that classification), so the report needs no drugSchedule filter — the
   * register's existence IS the narcotic classification. The persisted
   * balanceQuantity per movement is authoritative and never recomputed.
   *
   * The legacy display fields (type, quantity, quantityBefore, quantityAfter)
   * are preserved for the existing consumer and derived faithfully from the
   * register row, not from inventory movements.
   */
  static async getNarcoticRegister(
    branchId: string,
    startDate?: Date,
    endDate?: Date,
    pagination?: ReportPagination
  ) {
    const { page, limit } = normalizePagination(pagination)
    const registers = await prisma.narcoticRegister.findMany({
      where: {
        branchId,
        ...(startDate && endDate ? { entryDate: { gte: startDate, lte: endDate } } : {}),
      },
      include: {
        product: true,
      },
      orderBy: {
        entryDate: 'desc',
      },
    })

    // batchId is a free string on NarcoticRegister (no relation), so resolve
    // batch labels in one lookup for the movements in this page's result set.
    const batchIds = Array.from(new Set(registers.map((r) => r.batchId)))
    const batches = await prisma.batch.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, batchNumber: true },
    })
    const batchNumberBy = new Map(batches.map((b) => [b.id, b.batchNumber]))

    const rows = registers.map((r) => ({
      // ─── Authoritative register values (actual schema fields) ───
      id: r.id,
      date: r.entryDate,
      movementType: r.movementType,
      quantityIn: r.quantityIn,
      quantityOut: r.quantityOut,
      balanceQuantity: r.balanceQuantity,
      referenceType: r.referenceType,
      referenceId: r.referenceId,
      branchId: r.branchId,
      productId: r.productId,
      productName: r.product.name,
      drugSchedule: r.product.drugSchedule,
      batchId: r.batchId,
      batchNumber: batchNumberBy.get(r.batchId),
      patientName: r.patientName,
      doctorName: r.doctorName,
      doctorRegNo: r.doctorRegNo,
      prescriptionNo: r.prescriptionNo,
      // ─── Legacy display fields, derived from the register row ───
      type: r.movementType,
      quantity: r.quantityIn + r.quantityOut,
      quantityBefore: r.balanceQuantity - r.quantityIn + r.quantityOut,
      quantityAfter: r.balanceQuantity,
    }))
    return { ...paginate(rows, page, limit), page, limit }
  }

  /**
   * Consumption Report
   */
  static async getConsumptionReport(
    branchId: string,
    startDate: Date,
    endDate: Date,
    pagination?: ReportPagination
  ) {
    const { page, limit } = normalizePagination(pagination)
    // Consumption = stock dispensed via sales. Other OUT movements
    // (purchase returns to suppliers, adjustments, write-offs, transfers)
    // are stock movements but not consumption, so they are excluded.
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        type: 'OUT',
        referenceType: 'SALE',
        inventory: { branchId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        inventory: {
          include: {
            product: true,
          },
        },
      },
    })

    const consumptionMap = new Map<string, ConsumptionEntry>()

    for (const m of movements) {
      const pId = m.inventory.productId
      if (!consumptionMap.has(pId)) {
        consumptionMap.set(pId, {
          productId: pId,
          productName: m.inventory.product.name,
          sku: m.inventory.product.sku,
          totalConsumed: 0,
          salesConsumed: 0,
          otherConsumed: 0,
        })
      }
      const entry = consumptionMap.get(pId)
      if (entry) {
        entry.totalConsumed += m.quantity
        if (m.referenceType === 'SALE') {
          entry.salesConsumed += m.quantity
        } else {
          entry.otherConsumed += m.quantity
        }
      }
    }

    const rows = Array.from(consumptionMap.values()).sort(
      (a, b) => b.totalConsumed - a.totalConsumed
    )
    return { ...paginate(rows, page, limit), page, limit }
  }

  /**
   * Supplier Performance Report
   */
  static async getSupplierPerformance(
    branchId: string,
    startDate: Date,
    endDate: Date,
    pagination?: ReportPagination
  ) {
    const { page, limit } = normalizePagination(pagination)
    const suppliers = await prisma.supplier.findMany({
      include: {
        purchases: {
          where: {
            branchId,
            purchaseDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    })

    const rows = suppliers
      .filter((supplier) => supplier.purchases.length > 0)
      .map((supplier) => {
        const totalPurchases = supplier.purchases.length
        const completedPurchases = supplier.purchases.filter(
          (p) => p.status === 'RECEIVED' || p.status === 'INVOICED'
        ).length
        const totalAmount = roundCurrency(
          supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0)
        )

        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          totalPurchases,
          completedPurchases,
          fulfillmentRate:
            totalPurchases > 0 ? roundCurrency((completedPurchases / totalPurchases) * 100) : 0,
          totalAmount,
          // NOTE: outstandingBalance is supplier-global (not branch-scoped in the schema).
          outstandingBalance: Number(supplier.outstandingBalance),
        }
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)
    return { ...paginate(rows, page, limit), page, limit }
  }

  /**
   * Sales & Financial Report
   */
  static async getSalesFinancials(branchId: string, startDate: Date, endDate: Date) {
    // Revenue semantics (matches the dashboard convention): only COMPLETED
    // sales contribute to revenue. Returned/cancelled sales are excluded
    // rather than netted; their count is reported separately so the
    // exclusion is explicit instead of silent.
    const [sales, excludedSalesCount] = await Promise.all([
      prisma.sale.findMany({
        where: {
          branchId,
          saleDate: {
            gte: startDate,
            lte: endDate,
          },
          status: 'COMPLETED',
        },
        orderBy: {
          saleDate: 'asc',
        },
      }),
      prisma.sale.count({
        where: {
          branchId,
          saleDate: { gte: startDate, lte: endDate },
          status: { in: ['CANCELLED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED'] },
        },
      }),
    ])
    const timeZone = await resolveBranchTimezone(branchId)

    const summary = {
      totalSalesCount: sales.length,
      totalRevenue: 0,
      totalTax: 0,
      totalDiscount: 0,
      excludedSalesCount,
      dailyBreakdown: [] as DailySalesEntry[],
    }

    const dailyMap = new Map<string, DailySalesEntry>()

    for (const sale of sales) {
      summary.totalRevenue = roundCurrency(summary.totalRevenue + Number(sale.totalAmount))
      summary.totalTax = roundCurrency(summary.totalTax + Number(sale.taxAmount))
      summary.totalDiscount = roundCurrency(summary.totalDiscount + Number(sale.discountAmount))

      const day = toBusinessDay(sale.saleDate, timeZone)
      if (!dailyMap.has(day)) {
        dailyMap.set(day, {
          date: day,
          salesCount: 0,
          revenue: 0,
          tax: 0,
          discount: 0,
        })
      }
      const dayStats = dailyMap.get(day)
      if (dayStats) {
        dayStats.salesCount += 1
        dayStats.revenue = roundCurrency(dayStats.revenue + Number(sale.totalAmount))
        dayStats.tax = roundCurrency(dayStats.tax + Number(sale.taxAmount))
        dayStats.discount = roundCurrency(dayStats.discount + Number(sale.discountAmount))
      }
    }

    summary.dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    return summary
  }
}
