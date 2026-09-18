import { format } from 'date-fns'
import { Check, X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getPendingPrescriptions } from '@/lib/dashboard/queries'

export async function PendingRxList({ branchId }: { branchId?: string }) {
  const pendingRx = await getPendingPrescriptions(branchId, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Pending Prescriptions</CardTitle>
          <CardDescription>Awaiting pharmacist review</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/prescriptions">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {pendingRx.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No pending prescriptions
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            {pendingRx.map((rx) => (
              <div
                key={rx.id}
                className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {rx.patientName} {rx.patientAge ? `(${rx.patientAge}y)` : ''}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{rx.doctor?.name || rx.doctorName || 'Unknown Doctor'}</span>
                    <span>•</span>
                    <span>
                      {rx.prescriptionDate
                        ? format(rx.prescriptionDate, 'dd MMM yyyy')
                        : format(rx.createdAt, 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                    title="Approve"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
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
