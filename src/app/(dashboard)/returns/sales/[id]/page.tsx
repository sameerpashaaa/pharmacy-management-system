import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CREDIT_NOTE_STATUS_META } from '@/components/returns/credit-notes-table'
import { SALE_RETURN_STATUS_META } from '@/components/returns/sale-returns-table'
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
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getSaleReturnById } from '@/lib/returns/sale-return-service'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatDateTime } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Return Details' }

interface SaleReturnDetailPageProps {
  params: { id: string }
}

const RESTOCK_DECISION_META = {
  RESTOCK: { label: 'Restocked to Inventory', variant: 'success' as const },
  QUARANTINE: { label: 'Quarantine / Inspection', variant: 'warning' as const },
  DAMAGE_WRITE_OFF: { label: 'Damage Write-Off', variant: 'destructive' as const },
}

export default async function SaleReturnDetailPage({
  params,
}: SaleReturnDetailPageProps) {
  const [canRead, session] = await Promise.all([
    can(PERMISSIONS.RETURNS_READ),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Return Details</h1>
          <p className="text-muted-foreground">
            You do not have permission to view sales returns.
          </p>
        </div>
      </div>
    )
  }

  const scope = await resolveBranchScope(session.user)
  const actor = {
    id: session.user.id,
    branchId: scope,
    permissions: session.user.permissions ?? [],
  }

  const saleReturn = await getSaleReturnById(params.id, actor).catch((err) => {
    if (err instanceof Error && (err.message.includes('Not Found') || err.message.includes('Forbidden'))) {
      return null
    }
    throw err
  })

  if (!saleReturn) {
    notFound()
  }

  const statusMeta = SALE_RETURN_STATUS_META[saleReturn.status]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Return {saleReturn.returnNumber}
            </h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            {saleReturn.refundMethod && (
              <Badge variant="outline" className="capitalize">
                {saleReturn.refundMethod.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Processed on {formatDateTime(saleReturn.returnDate)} · Original Invoice:{' '}
            <Link
              href={ROUTES.SALE(saleReturn.sale.id)}
              className="text-primary hover:underline font-mono"
            >
              {saleReturn.sale.invoiceNumber}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.SALE_RETURNS}>Back to returns</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={ROUTES.SALE(saleReturn.sale.id)}>View Original Sale</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Items Table */}
          <Card>
            <CardHeader>
              <CardTitle>Returned Line Items</CardTitle>
              <CardDescription>
                {saleReturn.items.length} line(s) returned on this order
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 text-center font-medium">Qty</th>
                    <th className="py-2 pr-4 text-right font-medium">Unit Price</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 text-right font-medium">Restock Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {saleReturn.items.map((line) => {
                    const decisionMeta =
                      RESTOCK_DECISION_META[line.restockDecision] ??
                      RESTOCK_DECISION_META.RESTOCK

                    return (
                      <tr key={line.id} className="border-b">
                        <td className="py-3 pr-4">
                          <p className="font-medium">{line.saleItem.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.saleItem.productSku}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-center font-semibold tabular-nums">
                          {line.quantity}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {formatCurrency(Number(line.unitPrice))}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                          {formatCurrency(Number(line.totalAmount))}
                        </td>
                        <td className="py-3 text-right">
                          <Badge variant={decisionMeta.variant} className="text-xs">
                            {decisionMeta.label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Linked Credit Note Card if present */}
          {saleReturn.creditNote && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-primary">
                    Associated Credit Note
                  </CardTitle>
                  <Badge
                    variant={
                      CREDIT_NOTE_STATUS_META[saleReturn.creditNote.status].variant
                    }
                  >
                    {CREDIT_NOTE_STATUS_META[saleReturn.creditNote.status].label}
                  </Badge>
                </div>
                <CardDescription>
                  Store credit issued to customer for this return
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Credit Note #
                  </span>
                  <span className="font-mono font-bold">
                    {saleReturn.creditNote.noteNumber}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Issued Amount
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(Number(saleReturn.creditNote.amount))}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Available Balance
                  </span>
                  <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">
                    {formatCurrency(
                      Math.max(
                        0,
                        Number(saleReturn.creditNote.amount) -
                          Number(saleReturn.creditNote.balanceUsed)
                      )
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Return Summary</CardTitle>
              <CardDescription>Financial breakdown and customer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">
                  {saleReturn.customer ? saleReturn.customer.name : 'Walk-in customer'}
                </span>
              </div>
              {saleReturn.customer?.phone && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{saleReturn.customer.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Original Invoice</span>
                <Link
                  href={ROUTES.SALE(saleReturn.sale.id)}
                  className="font-mono text-primary hover:underline"
                >
                  {saleReturn.sale.invoiceNumber}
                </Link>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total Refund</span>
                <span className="text-lg font-bold text-primary tabular-nums">
                  {formatCurrency(Number(saleReturn.totalAmount))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Refund Method</span>
                <span className="font-medium capitalize">
                  {saleReturn.refundMethod
                    ? saleReturn.refundMethod.toLowerCase()
                    : 'N/A'}
                </span>
              </div>
              {saleReturn.refundRef && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Reference / Tx ID</span>
                  <span className="font-mono text-xs">{saleReturn.refundRef}</span>
                </div>
              )}
              {saleReturn.creditNote?.expiresAt && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Credit Expires</span>
                  <span className="font-medium">
                    {formatDate(saleReturn.creditNote.expiresAt)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t">
                <span className="text-xs text-muted-foreground block mb-1">
                  Reason for Return
                </span>
                <p className="text-sm font-medium">{saleReturn.reason}</p>
              </div>
              {saleReturn.notes && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-muted-foreground block mb-1">
                    Notes
                  </span>
                  <p className="text-xs text-muted-foreground">{saleReturn.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
