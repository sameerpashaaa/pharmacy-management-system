import { RotateCcw } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getPurchase } from '@/lib/purchases/purchase-service'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Purchase Order Detail' }

type Props = { params: { id: string } }

const STATUS_LABELS: Record<
  string,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ORDERED: { label: 'Ordered', variant: 'info' },
  SENT: { label: 'Sent', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', variant: 'warning' },
  RECEIVED: { label: 'Received', variant: 'success' },
  INVOICED: { label: 'Invoiced', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

const CAN_RECEIVE = new Set(['ORDERED', 'SENT', 'PARTIALLY_RECEIVED'])
const CAN_RETURN = new Set(['RECEIVED', 'INVOICED', 'PARTIALLY_RECEIVED'])

export default async function PurchaseDetailPage({ params }: Props) {
  const [canRead, canReceive, canReturn, session] = await Promise.all([
    can(PERMISSIONS.PURCHASES_READ),
    can(PERMISSIONS.PURCHASES_RECEIVE),
    can(PERMISSIONS.RETURNS_CREATE),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">
          You do not have permission to view this purchase order.
        </p>
      </div>
    )
  }

  const purchase = await getPurchase(params.id, session.user)
  if (!purchase) notFound()

  const statusMeta = STATUS_LABELS[purchase.status] ?? {
    label: purchase.status,
    variant: 'secondary' as const,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.PURCHASES}>&larr; Back</Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{purchase.purchaseNumber}</h1>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            </div>
            <p className="text-muted-foreground">
              {purchase.supplier?.name ?? 'Unknown supplier'} &middot;{' '}
              {formatDateTime(purchase.purchaseDate.toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canReturn && CAN_RETURN.has(purchase.status) && (
            <Button asChild variant="secondary" size="sm">
              <Link
                href={`${ROUTES.PURCHASE_RETURNS_NEW}?purchaseId=${purchase.id}`}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Return to Vendor
              </Link>
            </Button>
          )}
          {canReceive && CAN_RECEIVE.has(purchase.status) && (
            <Button asChild size="sm">
              <Link href={ROUTES.PURCHASE_RECEIVE(purchase.id)}>Receive Goods (GRN)</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{purchase.supplier?.name ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {purchase.expectedDate ? formatDateTime(purchase.expectedDate.toISOString()) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold tabular-nums">
              {formatCurrency(purchase.totalAmount.toString())}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {purchase.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{purchase.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 text-right font-medium">Ordered</th>
                  <th className="pb-2 text-right font-medium">Received</th>
                  <th className="pb-2 text-right font-medium">Unit Cost</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{item.product.name}</td>
                    <td className="py-2 text-muted-foreground">{item.product.sku}</td>
                    <td className="py-2 text-right">{item.orderedQuantity}</td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          item.receivedQuantity >= item.orderedQuantity
                            ? 'text-green-600'
                            : 'text-amber-600'
                        }
                      >
                        {item.receivedQuantity}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(item.unitCost.toString())}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(item.totalAmount.toString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Returns on this order */}
      {purchase.returns && purchase.returns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vendor Returns (RTV)</CardTitle>
            <CardDescription>
              {purchase.returns.length} return dispatch(es) recorded for this purchase order
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {purchase.returns.map((ret) => (
                <div
                  key={ret.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                >
                  <div>
                    <Link
                      href={ROUTES.PURCHASE_RETURN(ret.id)}
                      className="font-mono text-sm font-medium text-primary hover:underline"
                    >
                      {ret.returnNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(ret.returnDate.toISOString())} &middot; {ret.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-destructive">
                      -{formatCurrency(ret.totalAmount.toString())}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {ret.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
