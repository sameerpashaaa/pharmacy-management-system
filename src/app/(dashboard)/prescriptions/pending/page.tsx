import type { Metadata } from 'next'
import Link from 'next/link'

import type { PrescriptionRow } from '@/components/prescriptions/prescriptions-table'
import { PrescriptionsView } from '@/components/prescriptions/prescriptions-view'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { listPrescriptions } from '@/lib/prescriptions/prescription-service'
import { prescriptionQuerySchema } from '@/lib/validations/prescription'

export const metadata: Metadata = { title: 'Pending Prescriptions Queue' }

export default async function PendingPrescriptionsPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.PRESCRIPTIONS_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Prescriptions</h1>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view prescriptions.</p>
        </div>
      </div>
    )
  }

  const query = prescriptionQuerySchema.parse({
    page: 1,
    limit: 20,
    status: 'PENDING',
  })
  const firstPage = await listPrescriptions(query, session.user)

  const initialRows: PrescriptionRow[] = firstPage.data.map((rx) => ({
    id: rx.id,
    prescriptionNumber: rx.prescriptionNumber,
    patientName: rx.patientName,
    patientAge: rx.patientAge,
    patientPhone: rx.patientPhone,
    doctorName: rx.doctorName,
    doctorRegNumber: rx.doctorRegNumber,
    prescriptionDate: rx.prescriptionDate ? rx.prescriptionDate.toISOString() : null,
    status: rx.status as PrescriptionRow['status'],
    imagesCount: rx.images?.length ?? 0,
    customer: rx.customer ? { id: rx.customer.id, name: rx.customer.name } : null,
    approvedAt: rx.approvedAt ? rx.approvedAt.toISOString() : null,
    createdAt: rx.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Prescriptions Queue</h1>
          <p className="text-muted-foreground">
            Prescriptions awaiting clinical verification and pharmacist approval
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={ROUTES.PRESCRIPTIONS}>View All Prescriptions</Link>
          </Button>
          <Button asChild>
            <Link href="/prescriptions/new">New Prescription</Link>
          </Button>
        </div>
      </div>

      <PrescriptionsView
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
        defaultStatus="PENDING"
      />
    </div>
  )
}
