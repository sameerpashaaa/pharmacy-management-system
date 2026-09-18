import type { LucideIcon } from 'lucide-react'
import { Wallet, PackageX, TrendingUp, Trophy } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getInventoryValue,
  getOutOfStockCount,
  getMonthlySales,
  getTopProduct,
} from '@/lib/dashboard/queries'
import { formatCurrency } from '@/lib/utils/currency'

function KpiCardSkeleton({
  title,
  icon: Icon,
  color,
  bg,
}: {
  title: string
  icon: LucideIcon
  color: string
  bg: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`rounded-md p-2 ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-1 h-8 w-24" />
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  )
}

function KpiCardLayout({
  title,
  value,
  description,
  icon: Icon,
  color,
  bg,
  descriptionNode,
}: {
  title: string
  value: React.ReactNode
  description?: string
  descriptionNode?: React.ReactNode
  icon: LucideIcon
  color: string
  bg: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`rounded-md p-2 ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {descriptionNode ? (
          descriptionNode
        ) : (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

export async function InventoryValueCard({ branchId }: { branchId?: string }) {
  const value = await getInventoryValue(branchId)
  return (
    <KpiCardLayout
      title="Inventory Value"
      value={formatCurrency(value)}
      description="Total stock value"
      icon={Wallet}
      color="text-blue-600"
      bg="bg-blue-50"
    />
  )
}

export function InventoryValueCardSkeleton() {
  return (
    <KpiCardSkeleton title="Inventory Value" icon={Wallet} color="text-blue-600" bg="bg-blue-50" />
  )
}

export async function OutOfStockCard({ branchId }: { branchId?: string }) {
  const count = await getOutOfStockCount(branchId)
  return (
    <KpiCardLayout
      title="Out of Stock"
      value={count}
      description="Products with 0 quantity"
      icon={PackageX}
      color="text-red-600"
      bg="bg-red-50"
    />
  )
}

export function OutOfStockCardSkeleton() {
  return (
    <KpiCardSkeleton title="Out of Stock" icon={PackageX} color="text-red-600" bg="bg-red-50" />
  )
}

export async function MonthlySalesCard({ branchId }: { branchId?: string }) {
  const data = await getMonthlySales(branchId)
  const isUp = data.percentageChange >= 0

  return (
    <KpiCardLayout
      title="This Month's Sales"
      value={formatCurrency(data.current)}
      icon={TrendingUp}
      color="text-emerald-600"
      bg="bg-emerald-50"
      descriptionNode={
        <div className="mt-1 flex items-center text-xs">
          <span className={isUp ? 'font-medium text-green-600' : 'font-medium text-red-600'}>
            {isUp ? '▲' : '▼'} {Math.abs(data.percentageChange).toFixed(1)}%
          </span>
          <span className="ml-1 text-muted-foreground">vs last month</span>
        </div>
      }
    />
  )
}

export function MonthlySalesCardSkeleton() {
  return (
    <KpiCardSkeleton
      title="This Month's Sales"
      icon={TrendingUp}
      color="text-emerald-600"
      bg="bg-emerald-50"
    />
  )
}

export async function TopProductCard({ branchId }: { branchId?: string }) {
  const product = await getTopProduct(branchId)

  return (
    <KpiCardLayout
      title="Top Product"
      value={product ? product.productName : '-'}
      description={product ? `${product.quantity} sold this week` : 'No sales this week'}
      icon={Trophy}
      color="text-yellow-600"
      bg="bg-yellow-50"
    />
  )
}

export function TopProductCardSkeleton() {
  return (
    <KpiCardSkeleton title="Top Product" icon={Trophy} color="text-yellow-600" bg="bg-yellow-50" />
  )
}
