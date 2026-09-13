'use client'

// ─────────────────────────────────────────────────────────────
// Component — SalesTable
// Lists completed sales/invoices with payment + sale status.
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

export type SaleStatusRow = 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED'

export type PaymentStatusRow = 'PAID' | 'PARTIAL' | 'CREDIT' | 'OVERPAID'

export interface SalesRow {
  id: string
  invoiceNumber: string
  saleDate: string
  status: SaleStatusRow
  paymentStatus: PaymentStatusRow
  totalAmount: string
  amountPaid: string
  balanceDue: string
  customer: { id: string; name: string; phone: string | null } | null
  createdBy: { id: string; name: string } | null
}

// ─── Metadata ─────────────────────────────────────────────────

export const SALE_STATUS_META: Record<
  SaleStatusRow,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  PARTIALLY_RETURNED: { label: 'Partially Returned', variant: 'warning' },
  FULLY_RETURNED: { label: 'Fully Returned', variant: 'secondary' },
}

export const PAYMENT_STATUS_META: Record<
  PaymentStatusRow,
  { label: string; variant: 'success' | 'warning' | 'info' | 'outline' }
> = {
  PAID: { label: 'Paid', variant: 'success' },
  PARTIAL: { label: 'Partial', variant: 'warning' },
  CREDIT: { label: 'Credit', variant: 'info' },
  OVERPAID: { label: 'Overpaid', variant: 'outline' },
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<SalesRow>[] = [
  {
    accessorKey: 'invoiceNumber',
    header: 'Invoice',
    cell: ({ row }) => <span className="font-medium">{row.original.invoiceNumber}</span>,
  },
  {
    accessorKey: 'saleDate',
    header: 'Date',
    cell: ({ row }) => <span>{formatDateTime(row.original.saleDate)}</span>,
  },
  {
    accessorKey: 'customer.name',
    header: 'Customer',
    cell: ({ row }) =>
      row.original.customer ? (
        <span>{row.original.customer.name}</span>
      ) : (
        <span className="text-muted-foreground">Walk-in</span>
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
    accessorKey: 'amountPaid',
    header: 'Paid',
    cell: ({ row }) => (
      <span className="tabular-nums">{formatCurrency(row.original.amountPaid)}</span>
    ),
  },
  {
    accessorKey: 'paymentStatus',
    header: 'Payment',
    cell: ({ row }) => {
      const meta = PAYMENT_STATUS_META[row.original.paymentStatus]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = SALE_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'createdBy.name',
    header: 'Cashier',
    cell: ({ row }) => row.original.createdBy?.name ?? '-',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={ROUTES.SALE(row.original.id)}>View</Link>
      </Button>
    ),
  },
]

// ─── Component ───────────────────────────────────────────────

interface SalesTableProps {
  rows: SalesRow[]
  isLoading?: boolean
}

export function SalesTable({ rows, isLoading }: SalesTableProps) {
  return (
    <DataTable columns={columns} data={rows} isLoading={isLoading} emptyMessage="No sales found." />
  )
}
