import type { Metadata } from 'next'
import Link from 'next/link'

import type { PrescriptionRow } from '@/components/prescriptions/prescriptions-table'
import { PrescriptionsView } from '@/components/prescriptions/prescriptions-view'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import {
  getPrescriptionStats,
  listPrescriptions,
} from '@/lib/prescriptions/prescription-service'
import { prescriptionQuerySchema } from '@/lib/validations/prescription'

export const metadata: Metadata = { title: 'Prescription Management' }

export default async function PrescriptionsPage() {
  const [canRead, session] = await Promise.all([
    can(PERMISSIONS.PRESCRIPTIONS_READ),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prescription Management</h1>
          <p className="text-muted-foreground">Manage customer prescriptions and dispensing records</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view prescriptions.</p>
        </div>
      </div>
    )
  }

  const defaultQuery = prescriptionQuerySchema.parse({ page: 1, limit: 20 })
  const [firstPage, stats] = await Promise.all([
    listPrescriptions(defaultQuery, session.user),
    getPrescriptionStats(undefined, session.user),
  ])

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
    approvedBy: rx.approvedBy
      ? { id: rx.approvedBy.id, name: rx.approvedBy.name }
      : null,
    approvedAt: rx.approvedAt ? rx.approvedAt.toISOString() : null,
    createdAt: rx.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prescription Management</h1>
          <p className="text-muted-foreground">
            Verify patient prescriptions, manage Schedule H/X compliance, and track dispensing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={ROUTES.PRESCRIPTIONS_PENDING}>
              Pending Review ({stats.pending})
            </Link>
          </Button>
          <Button asChild>
            <Link href="/prescriptions/new">New Prescription</Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Registered
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className={stats.pending > 0 ? 'border-amber-400 bg-amber-50/20' : ''}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-amber-600">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3">
            <div className="text-2xl font-bold text-amber-700">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-emerald-600">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3">
            <div className="text-2xl font-bold text-emerald-700">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-blue-600">
              Dispensed
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3">
            <div className="text-2xl font-bold text-blue-700">{stats.dispensed}</div>
          </CardContent>
        </Card>
      </div>

      <PrescriptionsView
        initialRows={initialRows}
        initialPagination={firstPage.pagination}
      />
    </div>
  )
}
