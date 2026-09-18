'use client'

import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/currency'

export interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  creditDays: number
  outstandingBalance: string
  isActive: boolean
}

const columns: ColumnDef<CustomerRow>[] = [
  {
    accessorKey: 'name',
    header: 'Customer Name',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => row.original.email ?? <span className="text-muted-foreground">—</span>,
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
      <span className="font-medium tabular-nums">
        {formatCurrency(row.original.outstandingBalance)}
      </span>
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
        <Link href={`/customers/${row.original.id}`}>Edit</Link>
      </Button>
    ),
  },
]

interface CustomersTableProps {
  rows: CustomerRow[]
  isLoading?: boolean
}

export function CustomersTable({ rows, isLoading }: CustomersTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No customers found. Add your first customer to get started."
    />
  )
}
