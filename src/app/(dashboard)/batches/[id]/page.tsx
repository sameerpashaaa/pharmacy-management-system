import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BatchDetailActions } from '@/components/batches/batch-detail-actions'
import { STATUS_META } from '@/components/batches/batches-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { getBatchById } from '@/lib/batches/batch-service'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatDateTime } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Batch Details' }

export default async function BatchDetailPage({ params }: { params: { id: string } }) {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.BATCHES_READ), getSession()])

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Details</h1>
          <p className="text-muted-foreground">You do not have permission to view batches.</p>
        </div>
      </div>
    )
  }

  const detail = await getBatchById(params.id, session?.user ?? undefined)
  if (!detail) notFound()

  const statusMeta = STATUS_META[detail.status]

  const detailProps = {
    batchId: detail.id,
    status: detail.status,
    availableQuantity: detail.availableQuantity,
    initial: {
      batchNumber: detail.batchNumber,
      manufacturingDate: detail.manufacturingDate
        ? detail.manufacturingDate.toISOString().slice(0, 10)
        : '',
      expiryDate: detail.expiryDate.toISOString().slice(0, 10),
      purchasePrice: detail.purchasePrice.toString(),
      mrp: detail.mrp.toString(),
      supplierRef: detail.supplierRef,
    },
    canUpdate: await can(PERMISSIONS.BATCHES_UPDATE),
    canBlock: await can(PERMISSIONS.BATCHES_BLOCK),
    canDispose: await can(PERMISSIONS.BATCHES_DISPOSE),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Batch {detail.batchNumber}</h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {detail.product.name} · {detail.product.sku}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.BATCHES}>Back to batches</Link>
          </Button>
          <BatchDetailActions {...detailProps} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Batch Details</CardTitle>
            <CardDescription>Static batch information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Product" value={detail.product.name} />
            <InfoRow label="SKU" value={detail.product.sku} />
            <InfoRow label="Manufacturing Date" value={formatDate(detail.manufacturingDate)} />
            <InfoRow label="Expiry Date" value={formatDate(detail.expiryDate)} />
            <InfoRow
              label="Purchase Price"
              value={formatCurrency(detail.purchasePrice.toString())}
            />
            <InfoRow label="MRP" value={formatCurrency(detail.mrp.toString())} />
            <InfoRow label="Supplier Ref" value={detail.supplierRef ?? '-'} />
            {detail.blockedReason && (
              <InfoRow label="Blocked Reason" value={detail.blockedReason} />
            )}
            <InfoRow label="Created" value={formatDateTime(detail.createdAt)} />
            <InfoRow label="Last Updated" value={formatDateTime(detail.updatedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock</CardTitle>
            <CardDescription>Quantity tracked on this batch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Total Quantity" value={String(detail.quantity)} />
            <InfoRow label="Reserved" value={String(detail.reservedQuantity)} />
            <InfoRow label="Sold" value={String(detail.soldQuantity)} />
            <InfoRow label="Available" value={String(detail.availableQuantity)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disposals</CardTitle>
            <CardDescription>Write-offs recorded against this batch</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.disposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No disposals recorded.</p>
            ) : (
              <ul className="space-y-3">
                {detail.disposals.map((d) => (
                  <li key={d.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{d.reason}</Badge>
                      <span className="font-medium">-{d.quantity}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.notes ? `${d.notes} · ` : ''}
                      {formatDateTime(d.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
          <CardDescription>Every lifecycle transition for this batch</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.statusLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded.</p>
          ) : (
            <ol className="space-y-4">
              {detail.statusLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p>
                      <span className="font-medium">{log.fromStatus}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-medium">{log.toStatus}</span>
                    </p>
                    {log.reason && <p className="text-muted-foreground">{log.reason}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                      {log.changedById ? ` · by ${log.changedById.slice(0, 8)}` : ' · system'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
