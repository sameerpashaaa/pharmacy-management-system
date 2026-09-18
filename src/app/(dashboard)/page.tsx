import { Package } from 'lucide-react'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { CategorySalesChart } from '@/components/dashboard/category-sales-chart'
import { ExpiringSoonTable } from '@/components/dashboard/expiring-soon-table'
import {
  InventoryValueCard,
  InventoryValueCardSkeleton,
  OutOfStockCard,
  OutOfStockCardSkeleton,
  MonthlySalesCard,
  MonthlySalesCardSkeleton,
  TopProductCard,
  TopProductCardSkeleton,
} from '@/components/dashboard/kpi-cards'
import { LowStockTable } from '@/components/dashboard/low-stock-table'
import { PendingRxList } from '@/components/dashboard/pending-rx-list'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { SalesTrendChart } from '@/components/dashboard/sales-trend-chart'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getSalesTrend, getSalesByCategory } from '@/lib/dashboard/queries'
import prisma from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

// New Dashboard Components

// Queries for wrappers

export const metadata: Metadata = { title: 'Dashboard' }

// Wrappers for charts to handle Suspense data fetching
async function SalesTrendChartWrapper({ branchId, days }: { branchId?: string; days: number }) {
  const data = await getSalesTrend(branchId, days)
  return <SalesTrendChart data={data} days={days} />
}

async function CategorySalesChartWrapper({ branchId, days }: { branchId?: string; days: number }) {
  const data = await getSalesByCategory(branchId, days)
  return <CategorySalesChart data={data} days={days} />
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { days?: string; catDays?: string }
}) {
  const [
    canSales,
    canInventory,
    canBatches,
    canPrescriptions,
    canProducts,
    canPurchases,
    canReports,
    canCustomers,
    session,
  ] = await Promise.all([
    can(PERMISSIONS.SALES_READ),
    can(PERMISSIONS.INVENTORY_READ),
    can(PERMISSIONS.BATCHES_READ),
    can(PERMISSIONS.PRESCRIPTIONS_READ),
    can(PERMISSIONS.PRODUCTS_READ),
    can(PERMISSIONS.PURCHASES_READ),
    can(PERMISSIONS.REPORTS_SALES),
    can(PERMISSIONS.CUSTOMERS_READ),
    getSession(),
  ])

  const branchId = session?.user?.branchId || undefined
  const days = parseInt(searchParams.days || '7')
  const catDays = parseInt(searchParams.catDays || '30')

  // We can fetch simple fallback stats for the generic cards
  const totalProducts = await prisma.product.count({ where: { isActive: true } })
  const recentSales = canSales
    ? await prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: { branchId },
        include: { customer: { select: { name: true } } },
      })
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">{formatDate(new Date())} — Pharmacy overview</p>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {canSales && (
          <Suspense fallback={<MonthlySalesCardSkeleton />}>
            <MonthlySalesCard branchId={branchId} />
          </Suspense>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <div className="rounded-md bg-blue-50 p-2">
              <Package className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">Active products</p>
          </CardContent>
        </Card>

        {canInventory && (
          <Suspense fallback={<InventoryValueCardSkeleton />}>
            <InventoryValueCard branchId={branchId} />
          </Suspense>
        )}

        {canInventory && (
          <Suspense fallback={<OutOfStockCardSkeleton />}>
            <OutOfStockCard branchId={branchId} />
          </Suspense>
        )}

        {canSales && (
          <Suspense fallback={<TopProductCardSkeleton />}>
            <TopProductCard branchId={branchId} />
          </Suspense>
        )}
      </div>

      {/* Row 2: Sales Trend Chart & Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        {canSales ? (
          <Suspense
            fallback={
              <Card className="col-span-1 h-[400px] lg:col-span-2">
                <CardHeader>
                  <CardTitle>Sales Trend</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center text-sm text-muted-foreground">
                  Loading chart...
                </CardContent>
              </Card>
            }
          >
            <SalesTrendChartWrapper branchId={branchId} days={days} />
          </Suspense>
        ) : (
          <div className="col-span-1 lg:col-span-2"></div>
        )}

        <div className="col-span-1">
          <QuickActions
            canSales={canSales}
            canInventory={canInventory}
            canProducts={canProducts}
            canPurchases={canPurchases}
            canReports={canReports}
            canCustomers={canCustomers}
          />
        </div>
      </div>

      {/* Row 3: Expiring Soon & Low Stock */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canBatches && (
          <Suspense
            fallback={
              <Card className="h-[300px]">
                <CardHeader>
                  <CardTitle>Expiring Soon</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center text-sm text-muted-foreground">
                  Loading...
                </CardContent>
              </Card>
            }
          >
            <ExpiringSoonTable branchId={branchId} />
          </Suspense>
        )}

        {canInventory && (
          <Suspense
            fallback={
              <Card className="h-[300px]">
                <CardHeader>
                  <CardTitle>Low Stock</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center text-sm text-muted-foreground">
                  Loading...
                </CardContent>
              </Card>
            }
          >
            <LowStockTable branchId={branchId} />
          </Suspense>
        )}
      </div>

      {/* Row 4: Recent Sales & Pending Rx */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canSales && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
              <CardDescription>
                Latest transactions {branchId ? '' : 'across all branches'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No sales recorded recently
                </div>
              ) : (
                <div className="mt-2 space-y-4">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{sale.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.customer?.name ?? 'Walk-in Customer'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-medium">
                          {formatCurrency(Number(sale.totalAmount))}
                        </span>
                        <Badge
                          variant={sale.status === 'COMPLETED' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {sale.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canPrescriptions && (
          <Suspense
            fallback={
              <Card className="h-[300px]">
                <CardHeader>
                  <CardTitle>Pending Prescriptions</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center text-sm text-muted-foreground">
                  Loading...
                </CardContent>
              </Card>
            }
          >
            <PendingRxList branchId={branchId} />
          </Suspense>
        )}
      </div>

      {/* Row 5: Category Breakdown Chart */}
      {canSales && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Suspense
            fallback={
              <Card className="col-span-1 h-[400px] lg:col-span-2">
                <CardHeader>
                  <CardTitle>Sales by Category</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center text-sm text-muted-foreground">
                  Loading chart...
                </CardContent>
              </Card>
            }
          >
            <CategorySalesChartWrapper branchId={branchId} days={catDays} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
