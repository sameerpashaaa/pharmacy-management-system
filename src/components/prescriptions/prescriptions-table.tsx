'use client'

// ─────────────────────────────────────────────────────────────
// Component — PrescriptionsTable
// Lists prescriptions with status badges, doctor/patient info.
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatDateTime } from '@/lib/utils/date'
import type { PrescriptionStatus } from '@/lib/validations/prescription'

export interface PrescriptionRow {
  id: string
  prescriptionNumber: string | null
  patientName: string
  patientAge: number | null
  patientPhone: string | null
  doctorName: string | null
  doctorRegNumber: string | null
  prescriptionDate: string | null
  status: PrescriptionStatus
  imagesCount: number
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  createdAt: string
}

export const PRESCRIPTION_STATUS_META: Record<
  PrescriptionStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  PENDING: { label: 'Pending Review', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  DISPENSED: { label: 'Dispensed', variant: 'info' },
  EXPIRED: { label: 'Expired', variant: 'secondary' },
}

const columns: ColumnDef<PrescriptionRow>[] = [
  {
    accessorKey: 'prescriptionNumber',
    header: 'Rx Number',
    cell: ({ row }) => (
      <Link
        href={ROUTES.PRESCRIPTION(row.original.id)}
        className="font-medium text-primary hover:underline"
      >
        {row.original.prescriptionNumber ?? row.original.id.slice(0, 10)}
      </Link>
    ),
  },
  {
    accessorKey: 'patientName',
    header: 'Patient',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.patientName}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.patientAge ? `${row.original.patientAge} yrs` : ''}
          {row.original.patientPhone ? ` • ${row.original.patientPhone}` : ''}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'doctorName',
    header: 'Doctor',
    cell: ({ row }) => (
      <div>
        <div className="text-sm">{row.original.doctorName || '—'}</div>
        {row.original.doctorRegNumber && (
          <div className="text-xs text-muted-foreground">Reg: {row.original.doctorRegNumber}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'prescriptionDate',
    header: 'Date',
    cell: ({ row }) =>
      row.original.prescriptionDate
        ? formatDateTime(row.original.prescriptionDate)
        : formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: 'imagesCount',
    header: 'Images',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.imagesCount > 0 ? `${row.original.imagesCount} attached` : 'None'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = PRESCRIPTION_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={ROUTES.PRESCRIPTION(row.original.id)}>
            {row.original.status === 'PENDING' ? 'Review' : 'View'}
          </Link>
        </Button>
      </div>
    ),
  },
]

interface PrescriptionsTableProps {
  rows: PrescriptionRow[]
  isLoading?: boolean
}

export function PrescriptionsTable({ rows, isLoading }: PrescriptionsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No prescriptions found."
    />
  )
}
