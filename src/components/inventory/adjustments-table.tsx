'use client'

// ─────────────────────────────────────────────────────────────
// Component — AdjustmentsTable
// Lists stock adjustments with approval workflow actions
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import { Check, X } from 'lucide-react'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export type AdjustmentType =
  'PHYSICAL_COUNT' | 'DAMAGE' | 'THEFT' | 'EXPIRY' | 'CORRECTION' | 'OPENING_STOCK'

export type AdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface AdjustmentRow {
  id: string
  branchId: string
  productId: string
  adjustmentType: AdjustmentType
  quantity: number
  reason: string
  status: AdjustmentStatus
  approvedAt: string | null
  createdAt: string
  product: { id: string; name: string; sku: string }
  branch: { id: string; name: string; code: string | null }
  createdBy: { id: string; name: string }
}

interface AdjustmentsTableProps {
  rows: AdjustmentRow[]
  isLoading?: boolean
  canApprove?: boolean
  onApprove?: (row: AdjustmentRow) => void
  onReject?: (row: AdjustmentRow) => void
}

// ─── Metadata ─────────────────────────────────────────────────

const TYPE_META: Record<AdjustmentType, string> = {
  PHYSICAL_COUNT: 'Physical Count',
  DAMAGE: 'Damage',
  THEFT: 'Theft',
  EXPIRY: 'Expiry',
  CORRECTION: 'Correction',
  OPENING_STOCK: 'Opening Stock',
}

const STATUS_META: Record<
  AdjustmentStatus,
  { label: string; variant: 'warning' | 'success' | 'destructive' }
> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
}

// ─── Columns ─────────────────────────────────────────────────

function useColumns(
  canApprove: boolean,
  onApprove: ((row: AdjustmentRow) => void) | undefined,
  onReject: ((row: AdjustmentRow) => void) | undefined
): ColumnDef<AdjustmentRow>[] {
  const columns: ColumnDef<AdjustmentRow>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => formatDateTime(row.original.createdAt),
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
      accessorKey: 'branch.name',
      header: 'Branch',
      cell: ({ row }) => <span>{row.original.branch.name}</span>,
    },
    {
      accessorKey: 'adjustmentType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="secondary">{TYPE_META[row.original.adjustmentType]}</Badge>
      ),
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      cell: ({ row }) => {
        const qty = row.original.quantity
        return (
          <span className={qty < 0 ? 'font-medium text-destructive' : 'font-medium text-green-600'}>
            {qty > 0 ? `+${qty}` : qty}
          </span>
        )
      },
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => <span className="line-clamp-1 max-w-[220px]">{row.original.reason}</span>,
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
      accessorKey: 'createdBy.name',
      header: 'Created By',
      cell: ({ row }) => <span>{row.original.createdBy.name}</span>,
    },
  ]

  if (canApprove) {
    columns.push({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const adjustment = row.original
        if (adjustment.status !== 'PENDING') return null
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:text-green-700"
              title="Approve and apply adjustment"
              onClick={() => onApprove?.(adjustment)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              title="Reject adjustment"
              onClick={() => onReject?.(adjustment)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    })
  }

  return columns
}

// ─── Component ───────────────────────────────────────────────

export function AdjustmentsTable({
  rows,
  isLoading,
  canApprove = false,
  onApprove,
  onReject,
}: AdjustmentsTableProps) {
  return (
    <DataTable
      columns={useColumns(canApprove, onApprove, onReject)}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No stock adjustments found."
    />
  )
}
