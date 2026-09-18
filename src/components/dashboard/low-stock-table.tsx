import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getLowStockDetails } from '@/lib/dashboard/queries'

export async function LowStockTable({ branchId }: { branchId?: string }) {
  const lowStockItems = await getLowStockDetails(branchId, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Low Stock</CardTitle>
          <CardDescription>Top 5 items below threshold</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/inventory">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {lowStockItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No low stock items</div>
        ) : (
          <div className="mt-2 space-y-4">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p
                    className="max-w-[180px] truncate text-sm font-medium"
                    title={item.productName}
                  >
                    {item.productName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.categoryName || 'Uncategorized'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end space-y-1">
                    <Badge variant="destructive" className="border-red-200 bg-red-50 text-red-700">
                      {item.availableQuantity} left
                    </Badge>
                    <span className="text-xs text-muted-foreground">Min: {item.minStockLevel}</span>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    asChild
                    title="Reorder"
                  >
                    <Link href={`/purchases/new?product=${item.productId}`}>
                      <ShoppingCart className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
