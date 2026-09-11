import { getServerSession } from 'next-auth'
import { Package, ShoppingCart, AlertTriangle, TrendingUp, Users, FileText } from 'lucide-react'
import type { Metadata } from 'next'

import { authOptions } from '@/lib/auth/auth-config'
import prisma from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Dashboard' }

async function getDashboardStats() {
  const session = await getServerSession(authOptions)
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
    // Today's sales total
    prisma.sale.aggregate({
      where: {
        branchId: branchId ?? undefined,
        saleDate: { gte: today },
        status: 'COMPLETED',
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    // Total active products
    prisma.product.count({ where: { isActive: true } }),
    // Low stock products
    prisma.inventory.count({
      where: {
        branchId: branchId ?? undefined,
        availableQuantity: { lte: 10, gt: 0 },
      },
    }),
    // Expiring within 90 days
    prisma.batch.count({
      where: {
        status: 'ACTIVE',
        expiryDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    // Pending prescriptions
    prisma.prescription.count({ where: { status: 'PENDING' } }),
    // Recent 5 sales
    prisma.sale.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { branchId: branchId ?? undefined },
      include: { customer: { select: { name: true } } },
    }),
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
  const stats = await getDashboardStats()

  const statCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(Number(stats.todaySales._sum.totalAmount ?? 0)),
      description: `${stats.todaySales._count} transactions`,
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Total Products',
      value: stats.totalProducts.toString(),
      description: 'Active products',
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Low Stock',
      value: stats.lowStockCount.toString(),
      description: 'Products below threshold',
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      title: 'Expiring Soon',
      value: stats.expiringCount.toString(),
      description: 'Batches within 90 days',
      icon: ShoppingCart,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      title: 'Pending Rx',
      value: stats.pendingPrescriptions.toString(),
      description: 'Awaiting pharmacist approval',
      icon: FileText,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

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

      {/* Recent Sales */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Latest transactions from today</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentSales.length === 0 ? (
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

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '🛒 New Sale', href: '/pos' },
                { label: '📦 Receive Stock', href: '/purchases/new' },
                { label: '↩️ Process Return', href: '/returns/sales/new' },
                { label: '⚠️ Check Expiry', href: '/expiry' },
                { label: '👤 Add Customer', href: '/customers/new' },
                { label: '📊 View Reports', href: '/reports' },
              ].map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-center rounded-md border bg-card p-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {action.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
