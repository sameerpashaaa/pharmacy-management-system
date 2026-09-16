import { addDays } from 'date-fns'

import { prisma } from '@/lib/db/prisma'

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

export class ReportService {
  /**
   * Daily Stock Position Report
   */
  static async getDailyStockPosition(branchId: string) {
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

    return inventory.map((inv) => ({
      productId: inv.productId,
      productName: inv.product.name,
      sku: inv.product.sku,
      batchTotal: inv.totalQuantity,
      availableQuantity: inv.availableQuantity,
      reservedQuantity: inv.reservedQuantity,
      mrp: Number(inv.product.mrp),
      value: inv.availableQuantity * Number(inv.product.mrp),
    }))
  }

  /**
   * Near-Expiry Report
   */
  static async getNearExpiry(branchId: string, daysThreshold: number = 90) {
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

    return batches.map((batch) => ({
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
  }

  /**
   * Narcotic Register
   */
  static async getNarcoticRegister(branchId: string, startDate?: Date, endDate?: Date) {
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        inventory: {
          branchId,
          product: {
            drugSchedule: {
              in: ['X', 'H1'],
            },
          },
        },
        ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
      },
      include: {
        inventory: {
          include: {
            product: true,
          },
        },
        batch: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return movements.map((m) => ({
      id: m.id,
      date: m.createdAt,
      type: m.type,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      productName: m.inventory.product.name,
      drugSchedule: m.inventory.product.drugSchedule,
      batchNumber: m.batch?.batchNumber,
      quantity: m.quantity,
      quantityBefore: m.quantityBefore,
      quantityAfter: m.quantityAfter,
      notes: m.notes,
    }))
  }

  /**
   * Consumption Report
   */
  static async getConsumptionReport(branchId: string, startDate: Date, endDate: Date) {
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        type: 'OUT',
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

    return Array.from(consumptionMap.values()).sort((a, b) => b.totalConsumed - a.totalConsumed)
  }

  /**
   * Supplier Performance Report
   */
  static async getSupplierPerformance(branchId: string, startDate: Date, endDate: Date) {
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

    return suppliers
      .filter((supplier) => supplier.purchases.length > 0)
      .map((supplier) => {
        const totalPurchases = supplier.purchases.length
        const completedPurchases = supplier.purchases.filter(
          (p) => p.status === 'RECEIVED' || p.status === 'INVOICED'
        ).length
        const totalAmount = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0)

        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          totalPurchases,
          completedPurchases,
          fulfillmentRate: totalPurchases > 0 ? (completedPurchases / totalPurchases) * 100 : 0,
          totalAmount,
          outstandingBalance: Number(supplier.outstandingBalance),
        }
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)
  }

  /**
   * Sales & Financial Report
   */
  static async getSalesFinancials(branchId: string, startDate: Date, endDate: Date) {
    const sales = await prisma.sale.findMany({
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
    })

    const summary = {
      totalSalesCount: sales.length,
      totalRevenue: 0,
      totalTax: 0,
      totalDiscount: 0,
      dailyBreakdown: [] as DailySalesEntry[],
    }

    const dailyMap = new Map<string, DailySalesEntry>()

    for (const sale of sales) {
      summary.totalRevenue += Number(sale.totalAmount)
      summary.totalTax += Number(sale.taxAmount)
      summary.totalDiscount += Number(sale.discountAmount)

      const day = sale.saleDate.toISOString().split('T')[0]
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
        dayStats.revenue += Number(sale.totalAmount)
        dayStats.tax += Number(sale.taxAmount)
        dayStats.discount += Number(sale.discountAmount)
      }
    }

    summary.dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    return summary
  }
}
