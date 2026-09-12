'use client'

// ─────────────────────────────────────────────────────────────
// Component — MovementsTable
// Shows the stock movement history for products/branches
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type MovementType =
  'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN_IN' | 'RETURN_OUT' | 'TRANSFER' | 'WRITE_OFF'

export interface MovementRow {
  id: string
  type: MovementType
  quantity: number
  quantityBefore: number
  quantityAfter: number
  referenceType: string | null
  referenceId: string | null
  notes: string | null
  createdAt: string
  inventory: {
    productId: string
    product: { id: string; name: string; sku: string; unitOfMeasure: string }
    branch: { id: string; name: string; code: string | null }
  }
  createdBy: { id: string; name: string } | null
}

interface MovementsTableProps {
  rows: MovementRow[]
  isLoading?: boolean
}

// ─── Type metadata ────────────────────────────────────────────

const TYPE_META: Record<
  MovementType,
  { label: string; variant: 'default' | 'info' | 'warning' | 'secondary' | 'destructive' }
> = {
  IN: { label: 'Stock In', variant: 'default' },
  OUT: { label: 'Stock Out', variant: 'destructive' },
  ADJUSTMENT: { label: 'Adjustment', variant: 'warning' },
  RETURN_IN: { label: 'Customer Return', variant: 'info' },
  RETURN_OUT: { label: 'Supplier Return', variant: 'secondary' },
  TRANSFER: { label: 'Transfer', variant: 'secondary' },
  WRITE_OFF: { label: 'Write-off', variant: 'destructive' },
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<MovementRow>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: 'inventory.product.name',
    header: 'Product',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.inventory.product.name}</p>
        <p className="text-xs text-muted-foreground">{row.original.inventory.product.sku}</p>
      </div>
    ),
  },
  {
    accessorKey: 'inventory.branch.name',
    header: 'Branch',
    cell: ({ row }) => <span>{row.original.inventory.branch.name}</span>,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const meta = TYPE_META[row.original.type] ?? {
        label: row.original.type,
        variant: 'secondary',
      }
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ row }) => {
      const qty = row.original.quantity
      return (
        <span className={qty < 0 ? 'text-destructive' : 'text-green-600'}>
          {qty > 0 ? `+${qty}` : qty}
        </span>
      )
    },
  },
  {
    id: 'beforeAfter',
    header: 'Stock Level',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.quantityBefore} → {row.original.quantityAfter}
      </span>
    ),
  },
  {
    accessorKey: 'referenceType',
    header: 'Reference',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.referenceType ?? '—'}
        {row.original.referenceId ? ` #${row.original.referenceId.slice(-8)}` : ''}
      </span>
    ),
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ row }) => {
      const notes = row.original.notes
      if (!notes) return <span className="text-muted-foreground">—</span>
      return <span className="line-clamp-1 text-xs">{notes}</span>
    },
  },
]

// ─── Component ───────────────────────────────────────────────

export function MovementsTable({ rows, isLoading }: MovementsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No stock movements found."
    />
  )
}
