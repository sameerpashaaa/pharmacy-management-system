'use client'

// ─────────────────────────────────────────────────────────────
// Component — SaleReturnsTable
// Lists customer sales returns with status badges and invoice links.
// ─────────────────────────────────────────────────────────────
import type { PaymentMethod, SaleReturnStatus } from '@prisma/client'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

export interface SaleReturnRow {
  id: string
  returnNumber: string
  saleId: string
  invoiceNumber: string
  customerName: string | null
  returnDate: string
  reason: string
  totalAmount: number
  status: SaleReturnStatus
  refundMethod: PaymentMethod | null
  itemsCount: number
  hasCreditNote: boolean
}

export const SALE_RETURN_STATUS_META: Record<
  SaleReturnStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'info' },
  REFUNDED: { label: 'Refunded', variant: 'success' },
  CREDITED: { label: 'Credited', variant: 'default' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
}

const columns: ColumnDef<SaleReturnRow>[] = [
  {
    accessorKey: 'returnNumber',
    header: 'Return #',
    cell: ({ row }) => (
      <Link
        href={ROUTES.SALE_RETURN(row.original.id)}
        className="font-medium text-primary hover:underline"
      >
        {row.original.returnNumber}
      </Link>
    ),
  },
  {
    accessorKey: 'invoiceNumber',
    header: 'Invoice #',
    cell: ({ row }) => (
      <Link
        href={ROUTES.SALE(row.original.saleId)}
        className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {row.original.invoiceNumber}
      </Link>
    ),
  },
  {
    accessorKey: 'returnDate',
    header: 'Return Date',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateTime(row.original.returnDate)}
      </span>
    ),
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => (
      <span className="text-sm font-medium">{row.original.customerName ?? 'Walk-in'}</span>
    ),
  },
  {
    accessorKey: 'itemsCount',
    header: 'Items',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.itemsCount} item{row.original.itemsCount === 1 ? '' : 's'}
      </span>
    ),
  },
  {
    accessorKey: 'totalAmount',
    header: 'Amount',
    cell: ({ row }) => (
      <span className="font-semibold tabular-nums">{formatCurrency(row.original.totalAmount)}</span>
    ),
  },
  {
    accessorKey: 'refundMethod',
    header: 'Refund',
    cell: ({ row }) => {
      const method = row.original.refundMethod
      if (!method) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <Badge variant="outline" className="text-xs capitalize">
          {method.toLowerCase()}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = SALE_RETURN_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.SALE_RETURN(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

interface SaleReturnsTableProps {
  data: SaleReturnRow[]
}

export function SaleReturnsTable({ data }: SaleReturnsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="returnNumber"
      searchPlaceholder="Filter returns by return number..."
    />
  )
}
