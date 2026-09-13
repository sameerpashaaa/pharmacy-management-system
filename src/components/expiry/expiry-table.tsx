'use client'

// ─────────────────────────────────────────────────────────────
// Components — Expiry tables
// ExpiringBatchesTable: ACTIVE batches within the 90-day window with
// severity/days-remaining. ExpiredBatchesTable: EXPIRED status
// batches requiring disposal.
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatDate } from '@/lib/utils/date'

// ─── Row types ───────────────────────────────────────────────

export type ExpirySeverityRow = 'CRITICAL' | 'WARNING' | 'INFO'

export interface ExpiringBatchRow {
  id: string
  batchNumber: string
  expiryDate: string
  availableQuantity: number
  daysRemaining: number
  severity: ExpirySeverityRow
  product: { id: string; name: string; sku: string }
}

export interface ExpiredBatchRow {
  id: string
  batchNumber: string
  expiryDate: string
  status: 'EXPIRED'
  quantity: number
  availableQuantity: number
  daysPast: number
  product: { id: string; name: string; sku: string }
}

// ─── Severity metadata ───────────────────────────────────────

export const SEVERITY_META: Record<
  ExpirySeverityRow,
  { label: string; variant: 'destructive' | 'warning' | 'secondary' }
> = {
  CRITICAL: { label: 'Critical', variant: 'destructive' },
  WARNING: { label: 'Warning', variant: 'warning' },
  INFO: { label: 'Info', variant: 'secondary' },
}

// ─── Expiring columns ────────────────────────────────────────

const expiringColumns: ColumnDef<ExpiringBatchRow>[] = [
  {
    accessorKey: 'batchNumber',
    header: 'Batch',
    cell: ({ row }) => <span className="font-medium">{row.original.batchNumber}</span>,
  },
  {
    accessorKey: 'product.name',
    header: 'Product',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.product.name}</p>
        <p className="text-xs text-muted-foreground">{row.original.product.sku}</p>
      </div>
    ),
  },
  {
    accessorKey: 'expiryDate',
    header: 'Expiry',
    cell: ({ row }) => <span className="font-medium">{formatDate(row.original.expiryDate)}</span>,
  },
  {
    accessorKey: 'daysRemaining',
    header: 'Days Left',
    cell: ({ row }) => (
      <span className={row.original.severity === 'CRITICAL' ? 'font-medium text-destructive' : ''}>
        {row.original.daysRemaining}
      </span>
    ),
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    cell: ({ row }) => {
      const meta = SEVERITY_META[row.original.severity]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'availableQuantity',
    header: 'Available',
    cell: ({ row }) => (
      <span
        className={
          row.original.availableQuantity === 0 ? 'font-medium text-destructive' : 'text-green-600'
        }
      >
        {row.original.availableQuantity}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.BATCH(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

// ─── Expired columns ─────────────────────────────────────────

const expiredColumns: ColumnDef<ExpiredBatchRow>[] = [
  {
    accessorKey: 'batchNumber',
    header: 'Batch',
    cell: ({ row }) => <span className="font-medium">{row.original.batchNumber}</span>,
  },
  {
    accessorKey: 'product.name',
    header: 'Product',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.product.name}</p>
        <p className="text-xs text-muted-foreground">{row.original.product.sku}</p>
      </div>
    ),
  },
  {
    accessorKey: 'expiryDate',
    header: 'Expiry',
    cell: ({ row }) => <span className="font-medium">{formatDate(row.original.expiryDate)}</span>,
  },
  {
    accessorKey: 'daysPast',
    header: 'Expired',
    cell: ({ row }) => (
      <span className="font-medium text-destructive">{row.original.daysPast} day(s) past</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: () => <Badge variant="destructive">Expired</Badge>,
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ row }) => <span>{row.original.quantity}</span>,
  },
  {
    accessorKey: 'availableQuantity',
    header: 'Available',
    cell: ({ row }) => (
      <span
        className={
          row.original.availableQuantity === 0 ? 'font-medium text-destructive' : 'text-green-600'
        }
      >
        {row.original.availableQuantity}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.BATCH(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

// ─── Components ──────────────────────────────────────────────

export function ExpiringBatchesTable({
  rows,
  isLoading,
}: {
  rows: ExpiringBatchRow[]
  isLoading?: boolean
}) {
  return (
    <DataTable
      columns={expiringColumns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No batches expiring within the next 90 days."
    />
  )
}

export function ExpiredBatchesTable({
  rows,
  isLoading,
}: {
  rows: ExpiredBatchRow[]
  isLoading?: boolean
}) {
  return (
    <DataTable
      columns={expiredColumns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No expired batches."
    />
  )
}
