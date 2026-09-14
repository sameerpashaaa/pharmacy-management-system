'use client'

// ─────────────────────────────────────────────────────────────
// Component — SuppliersTable
// Lists suppliers with outstanding balance and status.
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/currency'

// ─── Types ───────────────────────────────────────────────────

export interface SupplierRow {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  creditDays: number
  outstandingBalance: string
  isActive: boolean
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<SupplierRow>[] = [
  {
    accessorKey: 'name',
    header: 'Supplier Name',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'contactPerson',
    header: 'Contact',
    cell: ({ row }) => row.original.contactPerson ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'creditDays',
    header: 'Credit Days',
    cell: ({ row }) => <span>{row.original.creditDays}d</span>,
  },
  {
    accessorKey: 'outstandingBalance',
    header: 'Outstanding',
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{formatCurrency(row.original.outstandingBalance)}</span>
    ),
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) =>
      row.original.isActive ? (
        <Badge variant="success">Active</Badge>
      ) : (
        <Badge variant="secondary">Inactive</Badge>
      ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/suppliers/${row.original.id}`}>Edit</Link>
      </Button>
    ),
  },
]

// ─── Component ───────────────────────────────────────────────

interface SuppliersTableProps {
  rows: SupplierRow[]
  isLoading?: boolean
}

export function SuppliersTable({ rows, isLoading }: SuppliersTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No suppliers found. Add your first supplier to get started."
    />
  )
}