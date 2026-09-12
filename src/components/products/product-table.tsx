'use client'

// ─────────────────────────────────────────────────────────────
// Component — ProductTable
// Displays paginated product list with actions
// ─────────────────────────────────────────────────────────────
import type { ColumnDef } from '@tanstack/react-table'
import { PackagePlus, Pencil, Trash2, Eye } from 'lucide-react'

import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/date'

// ─── Types ───────────────────────────────────────────────────

export interface ProductRow {
  id: string
  name: string
  genericName?: string | null
  sku: string
  barcode?: string | null
  manufacturer?: string | null
  mrp: string
  unitOfMeasure: string
  isActive: boolean
  isPrescriptionRequired: boolean
  drugSchedule: string
  hsnCode?: string | null
  createdAt: Date | string
  categories: { category: { id: string; name: string } }[]
}

interface ProductTableProps {
  products: ProductRow[]
  isLoading?: boolean
  onAddProduct?: () => void
  onViewProduct?: (product: ProductRow) => void
  onEditProduct?: (product: ProductRow) => void
  onToggleActive?: (product: ProductRow) => void
}

// ─── Columns ─────────────────────────────────────────────────

function useColumns(
  onView: (p: ProductRow) => void,
  onEdit: (p: ProductRow) => void,
  onToggleActive: (p: ProductRow) => void
): ColumnDef<ProductRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          {row.original.genericName && (
            <p className="text-xs text-muted-foreground">{row.original.genericName}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
    },
    {
      accessorKey: 'categories',
      header: 'Categories',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.categories.slice(0, 2).map((c) => (
            <Badge key={c.category.id} variant="secondary" className="text-xs">
              {c.category.name}
            </Badge>
          ))}
          {row.original.categories.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{row.original.categories.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'mrp',
      header: 'MRP',
      cell: ({ row }) => <span>₹{row.original.mrp}</span>,
    },
    {
      accessorKey: 'isPrescriptionRequired',
      header: 'Rx',
      cell: ({ row }) =>
        row.original.isPrescriptionRequired ? (
          <Badge variant="warning">Rx</Badge>
        ) : (
          <Badge variant="outline">OTC</Badge>
        ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'destructive'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onView(product)}
              title="View product"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(product)}
              title="Edit product"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggleActive(product)}
              title={product.isActive ? 'Deactivate product' : 'Activate product'}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]
}

// ─── Component ───────────────────────────────────────────────

export function ProductTable({
  products,
  isLoading,
  onAddProduct,
  onViewProduct,
  onEditProduct,
  onToggleActive,
}: ProductTableProps) {
  return (
    <DataTable
      columns={useColumns(
        (p) => onViewProduct?.(p),
        (p) => onEditProduct?.(p),
        (p) => onToggleActive?.(p)
      )}
      data={products}
      isLoading={isLoading}
      searchKey="name"
      searchPlaceholder="Search products…"
      emptyMessage="No products found. Add your first product to get started."
      toolbar={
        onAddProduct && (
          <Button size="sm" onClick={onAddProduct}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        )
      }
    />
  )
}
