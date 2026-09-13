'use client'

// ─────────────────────────────────────────────────────────────
// Component — BatchesTable
// Lists product batches with expiry, status and stock quantities
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { daysUntilExpiry, formatDate } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type BatchStatusRow = 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'DISPOSED' | 'EXHAUSTED'

export interface BatchRow {
  id: string
  batchNumber: string
  expiryDate: string
  manufacturingDate: string | null
  status: BatchStatusRow
  quantity: number
  availableQuantity: number
  purchasePrice: string
  mrp: string
  product: { id: string; name: string; sku: string }
}

interface BatchesTableProps {
  rows: BatchRow[]
  isLoading?: boolean
}

// ─── Metadata ─────────────────────────────────────────────────

export const STATUS_META: Record<
  BatchStatusRow,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  BLOCKED: { label: 'Blocked', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'destructive' },
  DISPOSED: { label: 'Disposed', variant: 'secondary' },
  EXHAUSTED: { label: 'Exhausted', variant: 'secondary' },
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<BatchRow>[] = [
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
    cell: ({ row }) => {
      const days = daysUntilExpiry(row.original.expiryDate)
      return (
        <div>
          <p className="font-medium">{formatDate(row.original.expiryDate)}</p>
          <p
            className={`text-xs ${
              days < 0
                ? 'text-destructive'
                : days <= 60
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
            }`}
          >
            {days < 0
              ? `${Math.abs(days)} day(s) past`
              : days === 0
                ? 'expires today'
                : `${days} day(s) left`}
          </p>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
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
    accessorKey: 'mrp',
    header: 'MRP',
    cell: ({ row }) => <span>{formatCurrency(row.original.mrp)}</span>,
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

// ─── Component ───────────────────────────────────────────────

export function BatchesTable({ rows, isLoading }: BatchesTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No batches found."
    />
  )
}
