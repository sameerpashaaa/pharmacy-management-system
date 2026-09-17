'use client'

// ─────────────────────────────────────────────────────────────
// Component — ProductCatalog
// Client container for the product catalog page — managed
// search, filters, pagination, and row actions.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ProductImportDialog } from '@/components/products/product-import-dialog'
import { ProductTable, type ProductRow } from '@/components/products/product-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'
import { useUiStore } from '@/lib/stores/ui-store'

interface ProductCatalogProps {
  initialProducts: ProductRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
  canCreate: boolean
  canUpdate: boolean
  canImport: boolean
}

interface CategoryOption {
  id: string
  name: string
}

export function ProductCatalog({
  initialProducts,
  initialPagination,
  canCreate,
  canUpdate,
  canImport,
}: ProductCatalogProps) {
  const router = useRouter()
  const toast = useToast()
  const { openConfirmDialog } = useUiStore()

  const [products, setProducts] = useState<ProductRow[]>(initialProducts)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [isActive, setIsActive] = useState<string>('all')
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    fetch('/api/categories/options')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategories(d.data as CategoryOption[])
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(
    async (opts?: { page?: number; reset?: boolean }) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(opts?.reset ? 1 : (opts?.page ?? page)))
        params.set('limit', '20')
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (categoryId !== 'all') params.set('categoryId', categoryId)
        if (isActive !== 'all') params.set('isActive', isActive === 'active' ? 'true' : 'false')

        const res = await fetch(`/api/products?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: ProductRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setProducts(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load products')
        }
      } catch {
        toast.error('Failed to load products')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, categoryId, isActive, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, categoryId, isActive]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  function handleToggleActive(product: ProductRow) {
    const action = product.isActive ? 'deactivate' : 'activate'
    openConfirmDialog({
      title: `${product.isActive ? 'Deactivate' : 'Activate'} Product`,
      description: `Are you sure you want to ${action} "${product.name}"?`,
      variant: product.isActive ? 'destructive' : 'default',
      onConfirm: async () => {
        const res = await fetch(`/api/products/${product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !product.isActive }),
        })
        if (res.ok) {
          toast.success(`Product ${action}d successfully`)
          void load()
        } else {
          toast.error(`Failed to ${action} product`)
        }
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={isActive} onValueChange={setIsActive}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            Page {page} of {Math.max(totalPages, 1)}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => load({ page: page - 1 })}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => load({ page: page + 1 })}
          >
            Next
          </Button>
          {canImport && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={() => router.push(ROUTES.PRODUCTS_NEW)}>
              Add Product
            </Button>
          )}
        </div>
      </div>

      <ProductImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => load({ reset: true })}
      />

      <ProductTable
        products={products}
        isLoading={loading}
        onAddProduct={canCreate ? () => router.push(ROUTES.PRODUCTS_NEW) : undefined}
        onViewProduct={(p) => router.push(ROUTES.PRODUCT(p.id))}
        onEditProduct={canUpdate ? (p) => router.push(ROUTES.PRODUCT_EDIT(p.id)) : undefined}
        onToggleActive={canUpdate ? handleToggleActive : undefined}
      />
    </div>
  )
}
