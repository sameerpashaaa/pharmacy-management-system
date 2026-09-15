'use client'

// ─────────────────────────────────────────────────────────────
// Component — PurchaseReturnsTable
// Lists supplier purchase returns (RTV) and debit memos.
// ─────────────────────────────────────────────────────────────
import type { PurchaseReturnStatus } from '@prisma/client'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

export interface PurchaseReturnRow {
  id: string
  returnNumber: string
  purchaseId: string
  purchaseNumber: string
  supplierId: string
  supplierName: string
  returnDate: string
  reason: string
  totalAmount: number
  status: PurchaseReturnStatus
}

export const PURCHASE_RETURN_STATUS_META: Record<
  PurchaseReturnStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'info' },
  DISPATCHED: { label: 'Dispatched', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

const columns: ColumnDef<PurchaseReturnRow>[] = [
  {
    accessorKey: 'returnNumber',
    header: 'Return #',
    cell: ({ row }) => (
      <Link
        href={ROUTES.PURCHASE_RETURN(row.original.id)}
        className="font-mono text-xs font-medium text-primary hover:underline"
      >
        {row.original.returnNumber}
      </Link>
    ),
  },
  {
    accessorKey: 'purchaseNumber',
    header: 'PO #',
    cell: ({ row }) => (
      <Link
        href={ROUTES.PURCHASE(row.original.purchaseId)}
        className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {row.original.purchaseNumber}
      </Link>
    ),
  },
  {
    accessorKey: 'supplierName',
    header: 'Supplier',
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.supplierName}</span>,
  },
  {
    accessorKey: 'returnDate',
    header: 'Return Date',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.original.returnDate)}</span>
    ),
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-[200px] text-xs text-muted-foreground">
        {row.original.reason}
      </span>
    ),
  },
  {
    accessorKey: 'totalAmount',
    header: 'Debit Amount',
    cell: ({ row }) => (
      <span className="font-semibold tabular-nums">{formatCurrency(row.original.totalAmount)}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = PURCHASE_RETURN_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.PURCHASE_RETURN(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

interface PurchaseReturnsTableProps {
  data: PurchaseReturnRow[]
}

export function PurchaseReturnsTable({ data }: PurchaseReturnsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="returnNumber"
      searchPlaceholder="Filter returns by return number..."
    />
  )
}
