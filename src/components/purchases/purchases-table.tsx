'use client'

// ─────────────────────────────────────────────────────────────
// Component — PurchasesTable
// Lists purchase orders with status badges.
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type PurchaseStatusRow =
  | 'DRAFT'
  | 'ORDERED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'INVOICED'
  | 'CANCELLED'

export interface PurchaseRow {
  id: string
  purchaseNumber: string
  purchaseDate: string
  status: PurchaseStatusRow
  totalAmount: string
  supplier: { id: string; name: string } | null
  createdBy: { id: string; name: string } | null
}

// ─── Metadata ─────────────────────────────────────────────────

export const PURCHASE_STATUS_META: Record<
  PurchaseStatusRow,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ORDERED: { label: 'Ordered', variant: 'info' },
  SENT: { label: 'Sent', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partial', variant: 'warning' },
  RECEIVED: { label: 'Received', variant: 'success' },
  INVOICED: { label: 'Invoiced', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<PurchaseRow>[] = [
  {
    accessorKey: 'purchaseNumber',
    header: 'PO Number',
    cell: ({ row }) => <span className="font-medium">{row.original.purchaseNumber}</span>,
  },
  {
    accessorKey: 'purchaseDate',
    header: 'Date',
    cell: ({ row }) => <span>{formatDateTime(row.original.purchaseDate)}</span>,
  },
  {
    accessorKey: 'supplier.name',
    header: 'Supplier',
    cell: ({ row }) =>
      row.original.supplier ? (
        <span>{row.original.supplier.name}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'totalAmount',
    header: 'Total',
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{formatCurrency(row.original.totalAmount)}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = PURCHASE_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'createdBy.name',
    header: 'Created By',
    cell: ({ row }) => row.original.createdBy?.name ?? '—',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.PURCHASE(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

// ─── Component ───────────────────────────────────────────────

interface PurchasesTableProps {
  rows: PurchaseRow[]
  isLoading?: boolean
}

export function PurchasesTable({ rows, isLoading }: PurchasesTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No purchase orders found."
    />
  )
}