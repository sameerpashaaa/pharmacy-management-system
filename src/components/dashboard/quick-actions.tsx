import {
  ShoppingCart,
  AlertTriangle,
  PlusCircle,
  FileText,
  BarChart3,
  UserPlus,
} from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function QuickActions({
  canSales,
  canInventory,
  canProducts,
  canPurchases,
  canReports,
  canCustomers,
}: {
  canSales: boolean
  canInventory: boolean
  canProducts: boolean
  canPurchases: boolean
  canReports: boolean
  canCustomers: boolean
}) {
  const actions = [
    canSales ? { label: 'New Sale', href: '/pos', icon: ShoppingCart } : null,
    canInventory ? { label: 'Check Expiry', href: '/expiry', icon: AlertTriangle } : null,
    canProducts ? { label: 'Add Product', href: '/products/new', icon: PlusCircle } : null,
    canPurchases ? { label: 'New PO', href: '/purchases/new', icon: FileText } : null,
    canReports ? { label: 'View Reports', href: '/reports', icon: BarChart3 } : null,
    canCustomers ? { label: 'Add Customer', href: '/customers/new', icon: UserPlus } : null,
  ].filter((a): a is NonNullable<typeof a> => a !== null)

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common daily tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {actions.map((action) => (
            <Button
              key={action.href}
              asChild
              variant="outline"
              className="flex h-auto flex-col items-center justify-center gap-2 py-4 transition-colors hover:border-green-500 hover:bg-green-50 hover:text-green-700"
            >
              <Link href={action.href}>
                <action.icon className="mb-1 h-5 w-5" />
                <span className="text-wrap text-center text-xs">{action.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
