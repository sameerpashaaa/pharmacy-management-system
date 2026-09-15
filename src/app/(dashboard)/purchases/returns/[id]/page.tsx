import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PURCHASE_RETURN_STATUS_META } from '@/components/purchases/purchase-returns-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getPurchaseReturnById } from '@/lib/purchases/purchase-service'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Purchase Return Detail' }

interface PurchaseReturnDetailPageProps {
  params: { id: string }
}

export default async function PurchaseReturnDetailPage({
  params,
}: PurchaseReturnDetailPageProps) {
  const [canRead, session] = await Promise.all([
    can(PERMISSIONS.PURCHASES_READ),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Return Details</h1>
          <p className="text-muted-foreground">
            You do not have permission to view purchase returns.
          </p>
        </div>
      </div>
    )
  }

  const purchaseReturn = await getPurchaseReturnById(params.id, session.user)
  if (!purchaseReturn) notFound()

  const statusMeta = PURCHASE_RETURN_STATUS_META[purchaseReturn.status]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Return {purchaseReturn.returnNumber}
            </h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            Returned on {formatDate(purchaseReturn.returnDate)} · Supplier:{' '}
            <span className="font-medium text-foreground">
              {purchaseReturn.supplier.name}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.PURCHASE_RETURNS}>Back to returns</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={ROUTES.PURCHASE(purchaseReturn.purchase.id)}>
              View Purchase Order
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Returned Line Items</CardTitle>
              <CardDescription>
                {purchaseReturn.items.length} product line(s) returned to vendor
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 text-center font-medium">Return Qty</th>
                    <th className="py-2 pr-4 text-right font-medium">Unit Cost</th>
                    <th className="py-2 pr-4 text-right font-medium">Line Total</th>
                    <th className="py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseReturn.items.map((line) => (
                    <tr key={line.id} className="border-b">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{line.product?.name ?? 'Product'}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.product?.sku ?? 'SKU'}
                          {line.batchId ? ` · Batch ID: ${line.batchId}` : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-center font-semibold tabular-nums">
                        {line.quantity}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatCurrency(Number(line.unitCost))}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                        {formatCurrency(Number(line.totalAmount))}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {line.reason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Debit Summary</CardTitle>
              <CardDescription>Supplier credit & adjustments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium">{purchaseReturn.supplier.name}</span>
              </div>
              {purchaseReturn.supplier.phone && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{purchaseReturn.supplier.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Purchase Order</span>
                <Link
                  href={ROUTES.PURCHASE(purchaseReturn.purchase.id)}
                  className="font-mono text-primary hover:underline"
                >
                  {purchaseReturn.purchase.purchaseNumber}
                </Link>
              </div>
              {purchaseReturn.purchase.invoiceNumber && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Supplier Invoice</span>
                  <span className="font-mono">{purchaseReturn.purchase.invoiceNumber}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground">Total Debited</span>
                <span className="text-lg font-bold text-destructive tabular-nums">
                  -{formatCurrency(Number(purchaseReturn.totalAmount))}
                </span>
              </div>
              <div className="border-t pt-3">
                <span className="text-xs text-muted-foreground block mb-1">
                  Reason for Return
                </span>
                <p className="text-sm font-medium">{purchaseReturn.reason}</p>
              </div>
              {purchaseReturn.notes && (
                <div className="border-t pt-3">
                  <span className="text-xs text-muted-foreground block mb-1">
                    Notes
                  </span>
                  <p className="text-xs text-muted-foreground">{purchaseReturn.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
