import { Prisma } from '@prisma/client'
import { startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns'

import prisma from '@/lib/db/prisma'

/**
 * Get total inventory value (sum of availableQuantity * purchasePrice for each batch/inventory item)
 */
export async function getInventoryValue(branchId?: string) {
  // We need to calculate value based on batches since they contain the purchasePrice
  // and available quantity for each batch.
  const batches = await prisma.batch.findMany({
    where: {
      status: 'ACTIVE',
      ...(branchId ? { branchId } : {}),
      quantity: { gt: 0 },
    },
    select: {
      quantity: true,
      reservedQuantity: true,
      purchasePrice: true,
    },
  })

  return batches.reduce((acc, batch) => {
    const available = batch.quantity - batch.reservedQuantity
    return acc + available * Number(batch.purchasePrice)
  }, 0)
}

/**
 * Get count of products that are out of stock
 */
export async function getOutOfStockCount(branchId?: string) {
  return prisma.inventory.count({
    where: {
      ...(branchId ? { branchId } : {}),
      availableQuantity: 0,
    },
  })
}

/**
 * Get sales for the current month and percentage change from the previous month
 */
export async function getMonthlySales(branchId?: string) {
  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const currentMonthEnd = endOfMonth(now)
  const previousMonthStart = startOfMonth(subMonths(now, 1))
  const previousMonthEnd = endOfMonth(subMonths(now, 1))

  const [currentMonthSales, previousMonthSales] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        ...(branchId ? { branchId } : {}),
        status: 'COMPLETED',
        saleDate: {
          gte: currentMonthStart,
          lte: currentMonthEnd,
        },
      },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: {
        ...(branchId ? { branchId } : {}),
        status: 'COMPLETED',
        saleDate: {
          gte: previousMonthStart,
          lte: previousMonthEnd,
        },
      },
      _sum: { totalAmount: true },
    }),
  ])

  const current = Number(currentMonthSales._sum.totalAmount || 0)
  const previous = Number(previousMonthSales._sum.totalAmount || 0)

  let percentageChange = 0
  if (previous > 0) {
    percentageChange = ((current - previous) / previous) * 100
  } else if (current > 0) {
    percentageChange = 100
  }

  return {
    current,
    previous,
    percentageChange,
  }
}

/**
 * Get the top selling product in the given range
 */
export async function getTopProduct(branchId?: string, days: number = 7) {
  const startDate = subDays(new Date(), days)
  startDate.setHours(0, 0, 0, 0)

  // Using raw query or aggregate
  const result = await prisma.saleItem.groupBy({
    by: ['productId', 'productName'],
    where: {
      sale: {
        ...(branchId ? { branchId } : {}),
        status: 'COMPLETED',
        saleDate: {
          gte: startDate,
        },
      },
    },
    _sum: {
      quantity: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: 1,
  })

  if (result.length === 0) return null

  return {
    productId: result[0].productId,
    productName: result[0].productName,
    quantity: result[0]._sum.quantity || 0,
  }
}

/**
 * Get sales trend grouped by date for charting
 */
export async function getSalesTrend(branchId?: string, days: number = 7) {
  const startDate = subDays(new Date(), days)
  startDate.setHours(0, 0, 0, 0)

  const sales = await prisma.sale.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: 'COMPLETED',
      saleDate: {
        gte: startDate,
      },
    },
    select: {
      saleDate: true,
      totalAmount: true,
    },
    orderBy: {
      saleDate: 'asc',
    },
  })

  // Group by date string (YYYY-MM-DD)
  const grouped = sales.reduce((acc: Record<string, number>, sale) => {
    // Local date string
    const dateStr = sale.saleDate.toISOString().split('T')[0]
    acc[dateStr] = (acc[dateStr] || 0) + Number(sale.totalAmount)
    return acc
  }, {})

  return Object.entries(grouped).map(([date, total]) => ({
    date,
    total,
  }))
}

/**
 * Get expiring soon batches
 */
export async function getExpiringSoonDetails(branchId?: string, limit: number = 5) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const ninetyDaysFromNow = new Date()
  ninetyDaysFromNow.setDate(today.getDate() + 90)

  return prisma.batch.findMany({
    where: {
      status: 'ACTIVE',
      ...(branchId ? { branchId } : {}),
      quantity: { gt: 0 },
      expiryDate: {
        gte: today,
        lte: ninetyDaysFromNow,
      },
    },
    include: {
      product: {
        select: { name: true, genericName: true },
      },
    },
    orderBy: {
      expiryDate: 'asc',
    },
    take: limit,
  })
}

/**
 * Get low stock inventory items
 */
export async function getLowStockDetails(branchId?: string, limit: number = 5) {
  const result = await prisma.$queryRaw`
    SELECT i.id, i."availableQuantity", p.id as "productId", p.name as "productName", p."minStockLevel", p."reorderLevel", c.name as "categoryName"
    FROM "inventory" i
    JOIN "products" p ON i."productId" = p.id
    LEFT JOIN "product_categories" pc ON p.id = pc."productId"
    LEFT JOIN "categories" c ON pc."categoryId" = c.id
    WHERE i."availableQuantity" <= p."minStockLevel"
    AND i."availableQuantity" > 0
    ${branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty}
    ORDER BY (i."availableQuantity" * 1.0 / p."minStockLevel") ASC
    LIMIT ${limit}
  `

  interface LowStockRow {
    productId: string
    productName: string
    sku: string
    availableQuantity: number
    minStockLevel: number
  }
  return result as LowStockRow[]
}

/**
 * Get pending prescriptions
 */
export async function getPendingPrescriptions(branchId?: string, limit: number = 5) {
  return prisma.prescription.findMany({
    where: {
      status: 'PENDING',
      ...(branchId ? { branchId } : {}),
    },
    include: {
      doctor: {
        select: { name: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  })
}

/**
 * Get sales grouped by category
 */
export async function getSalesByCategory(branchId?: string, days: number = 30) {
  const startDate = subDays(new Date(), days)
  startDate.setHours(0, 0, 0, 0)

  const result = await prisma.$queryRaw`
    SELECT c.name as "category", SUM(si."totalAmount") as "total"
    FROM "sale_items" si
    JOIN "sales" s ON si."saleId" = s.id
    JOIN "products" p ON si."productId" = p.id
    JOIN "product_categories" pc ON p.id = pc."productId"
    JOIN "categories" c ON pc."categoryId" = c.id
    WHERE s.status = 'COMPLETED'
    AND s."saleDate" >= ${startDate}
    ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
    GROUP BY c.name
    ORDER BY "total" DESC
  `

  interface CategorySalesRow {
    category: string
    total: string | number
  }
  return (result as CategorySalesRow[]).map((r) => ({
    name: r.category,
    value: Number(r.total),
  }))
}
