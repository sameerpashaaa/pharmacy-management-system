'use client'

// ─────────────────────────────────────────────────────────────
// Component — InventoryTable
// Displays current stock levels per product per branch
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'overstock'

export interface InventoryRow {
  id: string
  productId: string
  branchId: string
  totalQuantity: number
  reservedQuantity: number
  availableQuantity: number
  updatedAt: string
  stockStatus: StockStatus
  product: {
    id: string
    name: string
    sku: string
    unitOfMeasure: string
    reorderLevel: number
    maxStockLevel: number | null
  }
  branch: { id: string; name: string; code: string | null }
}

interface InventoryTableProps {
  rows: InventoryRow[]
  isLoading?: boolean
}

// ─── Status metadata ──────────────────────────────────────────

const STATUS_META: Record<
  StockStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'default' }
> = {
  in_stock: { label: 'In Stock', variant: 'success' },
  low_stock: { label: 'Low Stock', variant: 'warning' },
  out_of_stock: { label: 'Out of Stock', variant: 'destructive' },
  overstock: { label: 'Overstock', variant: 'info' },
}

// ─── Columns ─────────────────────────────────────────────────

const columns: ColumnDef<InventoryRow>[] = [
  {
    accessorKey: 'product.name',
    header: 'Product',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.product.name}</p>
        <p className="text-xs text-muted-foreground">
          {row.original.product.sku}
          {row.original.product.unitOfMeasure ? ` · ${row.original.product.unitOfMeasure}` : ''}
        </p>
      </div>
    ),
  },
  {
    accessorKey: 'branch.name',
    header: 'Branch',
    cell: ({ row }) => (
      <span>
        {row.original.branch.name}
        {row.original.branch.code ? ` (${row.original.branch.code})` : ''}
      </span>
    ),
  },
  {
    accessorKey: 'totalQuantity',
    header: 'Total',
    cell: ({ row }) => <span className="font-medium">{row.original.totalQuantity}</span>,
  },
  {
    accessorKey: 'reservedQuantity',
    header: 'Reserved',
    cell: ({ row }) => <span>{row.original.reservedQuantity}</span>,
  },
  {
    accessorKey: 'availableQuantity',
    header: 'Available',
    cell: ({ row }) => <span className="font-semibold">{row.original.availableQuantity}</span>,
  },
  {
    accessorKey: 'stockStatus',
    header: 'Status',
    cell: ({ row }) => {
      const meta = STATUS_META[row.original.stockStatus]
      return <Badge variant={meta.variant}>{meta.label}</Badge>
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Last Updated',
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
]

// ─── Component ───────────────────────────────────────────────

export function InventoryTable({ rows, isLoading }: InventoryTableProps) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No stock records found for the selected branch."
    />
  )
}
