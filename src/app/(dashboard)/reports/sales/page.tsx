import type { Metadata } from 'next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSession } from '@/lib/auth/auth-helpers'
import prisma from '@/lib/db/prisma'
import { formatCurrency } from '@/lib/utils/currency'

export const metadata: Metadata = { title: 'Sales Reports' }

export default async function SalesReportsPage() {
  const session = await getSession()
  const branchId = session?.user?.branchId

  // Default to last 30 days
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)
  startDate.setHours(0, 0, 0, 0)

  const where = {
    branchId: branchId ?? undefined,
    saleDate: { gte: startDate },
    status: 'COMPLETED' as const,
  }

  // Fetch sales for daily aggregation and payment methods
  const sales = await prisma.sale.findMany({
    where,
    select: {
      saleDate: true,
      totalAmount: true,
    },
    orderBy: { saleDate: 'asc' },
  })

  // Fetch payments for payment breakdown
  const payments = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      sale: where
    },
    _sum: { amount: true },
  })

  // Fetch top products
  const topProducts = await prisma.saleItem.groupBy({
    by: ['productName'],
    where: {
      sale: where
    },
    _sum: {
      quantity: true,
      totalAmount: true,
    },
    orderBy: {
      _sum: { totalAmount: 'desc' }
    },
    take: 10,
  })

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Reports (Last 30 Days)</h1>
        <p className="text-muted-foreground">Sales trends, product performance, and revenue analysis</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">Across {sales.length} transactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Products by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{p.productName}</p>
                    <p className="text-sm text-muted-foreground">{p._sum.quantity} units sold</p>
                  </div>
                  <div className="font-medium">{formatCurrency(Number(p._sum.totalAmount))}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Method Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="text-sm font-medium">{p.method}</p>
                  <div className="font-medium">{formatCurrency(Number(p._sum.amount))}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
