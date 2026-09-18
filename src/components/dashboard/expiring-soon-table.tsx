import { format, differenceInDays } from 'date-fns'
import { AlertCircle, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getExpiringSoonDetails } from '@/lib/dashboard/queries'

export async function ExpiringSoonTable({ branchId }: { branchId?: string }) {
  const expiringBatches = await getExpiringSoonDetails(branchId, 5)
  const today = new Date()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Expiring Soon</CardTitle>
          <CardDescription>Top 5 batches expiring within 90 days</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/expiry">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {expiringBatches.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No items expiring soon
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            {expiringBatches.map((batch) => {
              const daysRemaining = differenceInDays(batch.expiryDate, today)

              let statusColor = 'bg-yellow-100 text-yellow-800 border-yellow-200'
              let Icon = Clock

              if (daysRemaining < 15) {
                statusColor = 'bg-red-100 text-red-800 border-red-200'
                Icon = AlertCircle
              } else if (daysRemaining <= 30) {
                statusColor = 'bg-amber-100 text-amber-800 border-amber-200'
                Icon = AlertTriangle
              }

              return (
                <div
                  key={batch.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p
                      className="max-w-[200px] truncate text-sm font-medium"
                      title={batch.product.name}
                    >
                      {batch.product.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Batch: {batch.batchNumber}</span>
                      <span>•</span>
                      <span>Qty: {batch.quantity}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <Badge variant="outline" className={`flex items-center gap-1 ${statusColor}`}>
                      <Icon className="h-3 w-3" />
                      {daysRemaining} days
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(batch.expiryDate, 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
