import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PrescriptionDetailActions } from '@/components/prescriptions/prescription-detail-actions'
import { PRESCRIPTION_STATUS_META } from '@/components/prescriptions/prescriptions-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getPrescriptionById } from '@/lib/prescriptions/prescription-service'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

interface PrescriptionPageProps {
  params: { id: string }
}

export const metadata: Metadata = { title: 'Prescription Details' }

export default async function PrescriptionDetailPage({
  params,
}: PrescriptionPageProps) {
  const [canRead, canApprove, session] = await Promise.all([
    can(PERMISSIONS.PRESCRIPTIONS_READ),
    can(PERMISSIONS.PRESCRIPTIONS_APPROVE),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prescription Details</h1>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view prescriptions.</p>
        </div>
      </div>
    )
  }

  let rx
  try {
    rx = await getPrescriptionById(params.id, session.user)
  } catch {
    notFound()
  }

  const statusMeta = PRESCRIPTION_STATUS_META[rx.status]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href={ROUTES.PRESCRIPTIONS}>← Back</Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              {rx.prescriptionNumber ?? 'Prescription Record'}
            </h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Registered on {formatDateTime(rx.createdAt.toISOString())}
          </p>
        </div>

        <PrescriptionDetailActions
          prescriptionId={rx.id}
          status={rx.status}
          canApprove={canApprove}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Patient Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Patient Name:</span>
              <span className="font-medium">{rx.patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Age:</span>
              <span className="font-medium">{rx.patientAge ? `${rx.patientAge} years` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone Number:</span>
              <span className="font-medium">{rx.patientPhone || '—'}</span>
            </div>
            {rx.customerId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer Profile:</span>
                <Link
                  href={`/customers/${rx.customerId}`}
                  className="text-primary hover:underline font-medium"
                >
                  {rx.approvedBy?.name ?? 'View Customer'}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Doctor Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Prescribing Practitioner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Doctor Name:</span>
              <span className="font-medium">{rx.doctorName || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Medical Reg Number:</span>
              <span className="font-medium">{rx.doctorRegNumber || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prescription Date:</span>
              <span className="font-medium">
                {rx.prescriptionDate ? formatDateTime(rx.prescriptionDate.toISOString()) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clinical Review & Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Clinical & Verification Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {rx.notes && (
            <div>
              <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Prescription / Medication Notes
              </div>
              <p className="rounded-md bg-muted p-3">{rx.notes}</p>
            </div>
          )}

          {rx.status === 'APPROVED' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-emerald-900">
              <div className="font-semibold">Verified & Approved</div>
              <div className="text-xs text-emerald-700 mt-1">
                Approved by {rx.pharmacist?.name ?? 'Pharmacist'} on{' '}
                {rx.approvedAt ? formatDateTime(rx.approvedAt.toISOString()) : '—'}
              </div>
            </div>
          )}

          {rx.status === 'REJECTED' && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
              <div className="font-semibold">Prescription Rejected</div>
              <div className="text-sm mt-1">Reason: {rx.rejectionReason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attached Images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Prescription Scans ({rx.images.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rx.images.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No prescription image files attached.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {rx.images.map((img) => (
                <div
                  key={img.id}
                  className="rounded-lg border overflow-hidden bg-card flex flex-col"
                >
                  <div className="h-40 bg-muted flex items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.fileUrl}
                      alt={img.fileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="p-3 text-xs flex items-center justify-between border-t bg-background">
                    <span className="truncate font-medium">{img.fileName}</span>
                    <a
                      href={img.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-2 flex-shrink-0"
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispensed Sales */}
      {rx.sales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Dispensing History ({rx.sales.length} Invoices)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y text-sm">
              {rx.sales.map((s) => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/sales/${s.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.invoiceNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(s.saleDate.toISOString())}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatCurrency(Number(s.totalAmount))}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {s.status}
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
