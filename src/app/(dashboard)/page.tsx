import { Package, ShoppingCart, AlertTriangle, TrendingUp, FileText } from 'lucide-react'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Dashboard' }

async function getDashboardStats(permissions: {
  sales: boolean
  inventory: boolean
  batches: boolean
  prescriptions: boolean
}) {
  const session = await getSession()
  const branchId = session?.user?.branchId

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    todaySales,
    totalProducts,
    lowStockCount,
    expiringCount,
    pendingPrescriptions,
    recentSales,
  ] = await Promise.all([
    permissions.sales
      ? prisma.sale.aggregate({
          where: {
            branchId: branchId ?? undefined,
            saleDate: { gte: today },
            status: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        })
      : Promise.resolve(null),
    prisma.product.count({ where: { isActive: true } }),
    permissions.inventory
      ? prisma.inventory.count({
          where: {
            branchId: branchId ?? undefined,
            availableQuantity: { lte: 10, gt: 0 },
          },
        })
      : Promise.resolve(null),
    permissions.batches
      ? prisma.batch.count({
          where: {
            status: 'ACTIVE',
            expiryDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            },
          },
        })
      : Promise.resolve(null),
    permissions.prescriptions
      ? prisma.prescription.count({ where: { status: 'PENDING' } })
      : Promise.resolve(null),
    permissions.sales
      ? prisma.sale.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          where: { branchId: branchId ?? undefined },
          include: { customer: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ])

  return {
    todaySales,
    totalProducts,
    lowStockCount,
    expiringCount,
    pendingPrescriptions,
    recentSales,
  }
}

export default async function DashboardPage() {
  const [canSales, canInventory, canBatches, canPrescriptions, session] = await Promise.all([
    can(PERMISSIONS.SALES_READ),
    can(PERMISSIONS.INVENTORY_READ),
    can(PERMISSIONS.BATCHES_READ),
    can(PERMISSIONS.PRESCRIPTIONS_READ),
    getSession(),
  ])

  const stats = await getDashboardStats({
    sales: canSales,
    inventory: canInventory,
    batches: canBatches,
    prescriptions: canPrescriptions,
  })

  const statCards = [
    canSales
      ? {
          title: "Today's Sales",
          value: formatCurrency(Number(stats.todaySales?._sum.totalAmount ?? 0)),
          description: `${stats.todaySales?._count?._all ?? 0} transactions`,
          icon: TrendingUp,
          color: 'text-green-600',
          bg: 'bg-green-50',
        }
      : null,
    {
      title: 'Total Products',
      value: stats.totalProducts.toString(),
      description: 'Active products',
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    canInventory
      ? {
          title: 'Low Stock',
          value: stats.lowStockCount?.toString() ?? '0',
          description: 'Products below threshold',
          icon: AlertTriangle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
        }
      : null,
    canBatches
      ? {
          title: 'Expiring Soon',
          value: stats.expiringCount?.toString() ?? '0',
          description: 'Batches within 90 days',
          icon: ShoppingCart,
          color: 'text-red-600',
          bg: 'bg-red-50',
        }
      : null,
    canPrescriptions
      ? {
          title: 'Pending Rx',
          value: stats.pendingPrescriptions?.toString() ?? '0',
          description: 'Awaiting pharmacist approval',
          icon: FileText,
          color: 'text-purple-600',
          bg: 'bg-purple-50',
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const quickActions = [
    canSales ? { label: '🛒 New Sale', href: '/pos' } : null,
    canInventory ? { label: '⚠️ Check Expiry', href: '/expiry' } : null,
  ].filter((a): a is NonNullable<typeof a> => a !== null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {formatDate(new Date())} — Pharmacy overview
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`rounded-md p-2 ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Sales */}
        {canSales && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
              <CardDescription>Latest transactions {session?.user?.branchId ? '' : 'across all branches'}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentSales?.length === 0 || !stats.recentSales ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No sales recorded today
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{sale.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.customer?.name ?? 'Walk-in Customer'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCurrency(Number(sale.totalAmount))}</span>
                        <Badge variant={sale.status === 'COMPLETED' ? 'default' : 'destructive'} className="text-xs">
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

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action) => (
                  <Button key={action.href} asChild variant="outline" className="h-auto py-3">
                    <a href={action.href} className="flex items-center justify-center gap-2">
                      {action.label}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}