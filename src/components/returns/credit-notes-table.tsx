'use client'

// ─────────────────────────────────────────────────────────────
// Component — CreditNotesTable
// Displays customer credit notes, remaining balances, and status.
// ─────────────────────────────────────────────────────────────
import type { CreditNoteStatus } from '@prisma/client'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

export interface CreditNoteRow {
  id: string
  noteNumber: string
  saleReturnId: string
  returnNumber: string
  invoiceNumber: string
  customerName: string | null
  amount: number
  balanceUsed: number
  availableBalance: number
  status: CreditNoteStatus
  expiresAt: string | null
  createdAt: string
}

export const CREDIT_NOTE_STATUS_META: Record<
  CreditNoteStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  PARTIALLY_USED: { label: 'Partially Used', variant: 'info' },
  FULLY_USED: { label: 'Fully Used', variant: 'secondary' },
  EXPIRED: { label: 'Expired', variant: 'outline' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

const columns: ColumnDef<CreditNoteRow>[] = [
  {
    accessorKey: 'noteNumber',
    header: 'Note #',
    cell: ({ row }) => (
      <span className="font-mono font-medium text-foreground">{row.original.noteNumber}</span>
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
    accessorKey: 'returnNumber',
    header: 'Return / Invoice',
    cell: ({ row }) => (
      <div className="flex flex-col text-xs">
        <Link
          href={ROUTES.SALE_RETURN(row.original.saleReturnId)}
          className="text-primary hover:underline"
        >
          {row.original.returnNumber}
        </Link>
        <span className="font-mono text-muted-foreground">Inv: {row.original.invoiceNumber}</span>
      </div>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Credit Amount',
    cell: ({ row }) => (
      <span className="font-semibold tabular-nums">{formatCurrency(row.original.amount)}</span>
    ),
  },
  {
    accessorKey: 'availableBalance',
    header: 'Available Balance',
    cell: ({ row }) => {
      const balance = row.original.availableBalance
      return (
        <span
          className={`font-semibold tabular-nums ${
            balance > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          }`}
        >
          {formatCurrency(balance)}
        </span>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = CREDIT_NOTE_STATUS_META[row.original.status]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'expiresAt',
    header: 'Expires',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.expiresAt ? formatDate(row.original.expiresAt) : 'Never'}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Issued',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
    ),
  },
]

interface CreditNotesTableProps {
  data: CreditNoteRow[]
}

export function CreditNotesTable({ data }: CreditNotesTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="noteNumber"
      searchPlaceholder="Filter credit notes by note number..."
    />
  )
}
