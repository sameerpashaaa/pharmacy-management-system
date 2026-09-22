import { RotateCcw } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getSaleById } from '@/lib/sales/sales-service'
import { PAYMENT_STATUS_META, SALE_STATUS_META } from '@/lib/sales/status-meta'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

import { SaleActionButtons } from './sale-action-buttons'



export const metadata: Metadata = { title: 'Sale Details' }

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const [canRead, canReturn, canCancel, canRecordPayment, session] = await Promise.all([
    can(PERMISSIONS.SALES_READ),
    can(PERMISSIONS.RETURNS_CREATE),
    can(PERMISSIONS.SALES_VOID),
    can(PERMISSIONS.CUSTOMERS_PAYMENTS),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sale Details</h1>
          <p className="text-muted-foreground">You do not have permission to view sales.</p>
        </div>
      </div>
    )
  }

  const scope = await resolveBranchScope(session.user)
  const sale = await getSaleById(params.id, scope).catch((err) => {
    if (err instanceof Error && err.message.startsWith('Forbidden')) return null
    if (err instanceof Error && err.message.startsWith('Not Found')) return null
    throw err
  })
  if (!sale) notFound()

  const saleMeta = SALE_STATUS_META[sale.status]
  const paymentMeta = PAYMENT_STATUS_META[sale.paymentStatus]

  const remainingToReturn = sale.items.reduce(
    (sum, item) => sum + (item.quantity - (item.returnedQuantity || 0)),
    0
  )
  const isReturnable =
    canReturn &&
    sale.status !== 'CANCELLED' &&
    sale.status !== 'FULLY_RETURNED' &&
    remainingToReturn > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Invoice {sale.invoiceNumber}</h1>
            <Badge variant={saleMeta.variant}>{saleMeta.label}</Badge>
            <Badge variant={paymentMeta.variant}>{paymentMeta.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {formatDateTime(sale.saleDate)}
            {sale.customer ? (
              <>
                {' · '}
                <Link
                  href={ROUTES.CUSTOMER(sale.customer.id)}
                  className="font-medium text-primary hover:underline"
                >
                  {sale.customer.name}
                </Link>
              </>
            ) : (
              ' · Walk-in customer'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isReturnable && (
            <Button asChild size="sm" variant="default">
              <Link href={`${ROUTES.SALE_RETURNS_NEW}?saleId=${sale.id}`} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Process Return
              </Link>
            </Button>
          )}
          <Suspense fallback={<div className="h-9 w-[200px]" />}>
            <SaleActionButtons
              saleId={sale.id}
              canCancel={canCancel && sale.status === 'COMPLETED'}
              canRecordPayment={
                canRecordPayment && sale.status !== 'CANCELLED' && Number(sale.balanceDue) > 0
              }
              customerId={sale.customer?.id ?? null}
              balanceDue={Number(sale.balanceDue)}
            />
          </Suspense>
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.SALES}>Back to sales</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>{sale.items.length} line(s) on this invoice</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 text-center font-medium">Qty</th>
                    <th className="py-2 pr-4 text-center font-medium">Ret</th>
                    <th className="py-2 pr-4 text-right font-medium">Unit</th>
                    <th className="py-2 pr-4 text-right font-medium">Disc</th>
                    <th className="py-2 pr-4 text-right font-medium">Tax</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.productSku}
                          {item.itemBatches.length > 0 &&
                            ` · Batch ${item.itemBatches
                              .map((ib) => ib.batch.batchNumber)
                              .join(', ')}`}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-center tabular-nums">{item.quantity}</td>
                      <td className="py-3 pr-4 text-center tabular-nums text-muted-foreground">
                        {item.returnedQuantity > 0 ? (
                          <span className="font-medium text-amber-600">
                            {item.returnedQuantity}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatCurrency(item.unitPrice.toString())}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {Number(item.discountPercent) > 0
                          ? `${Number(item.discountPercent)}%`
                          : '-'}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatCurrency(item.taxAmount.toString())}
                      </td>
                      <td className="py-3 text-right font-medium tabular-nums">
                        {formatCurrency(item.totalAmount.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {sale.returns && sale.returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Returns on this Invoice</CardTitle>
                <CardDescription>{sale.returns.length} return order(s) processed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sale.returns.map((ret) => (
                    <div
                      key={ret.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <Link
                          href={ROUTES.SALE_RETURN(ret.id)}
                          className="font-medium text-primary hover:underline"
                        >
                          {ret.returnNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(ret.returnDate)}
                          {ret.refundMethod ? ` · ${ret.refundMethod.toLowerCase()}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(ret.totalAmount.toString())}
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

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>How this invoice was settled</CardDescription>
            </CardHeader>
            <CardContent>
              {sale.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {sale.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <span className="capitalize">
                        {p.method.toLowerCase()}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(p.amount.toString())}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Invoice breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Subtotal" value={formatCurrency(sale.subtotal.toString())} />
            <InfoRow
              label="Discount"
              value={`-${formatCurrency(sale.discountAmount.toString())}`}
            />
            <InfoRow label="GST" value={formatCurrency(sale.taxAmount.toString())} />
            <InfoRow label="Amount Paid" value={formatCurrency(sale.amountPaid.toString())} />
            <InfoRow label="Balance Due" value={formatCurrency(sale.balanceDue.toString())} />
            {sale.prescriptionId && <InfoRow label="Prescription" value={sale.prescriptionId} />}
            {sale.notes && <InfoRow label="Notes" value={sale.notes} />}
            <InfoRow label="Cashier" value={sale.createdBy.name} />
            <InfoRow label="Created" value={formatDateTime(sale.createdAt)} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
