'use client'

// ─────────────────────────────────────────────────────────────
// Component — InventoryOverview
// Client container for the stock overview page — managed
// search, branch/status filters, and pagination.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { InventoryTable, type InventoryRow } from '@/components/inventory/inventory-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'

interface InventoryOverviewProps {
  initialRows: InventoryRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
  initialBranchId: string | null
}

interface BranchOption {
  id: string
  name: string
  code: string | null
}

export function InventoryOverview({
  initialRows,
  initialPagination,
  initialBranchId,
}: InventoryOverviewProps) {
  const toast = useToast()

  const [rows, setRows] = useState<InventoryRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [branchId, setBranchId] = useState<string>(initialBranchId ?? 'all')
  const [status, setStatus] = useState<string>('all')
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    fetch('/api/inventory/branches')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBranches(d.data as BranchOption[])
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
        if (branchId !== 'all') params.set('branchId', branchId)
        if (status !== 'all') params.set('status', status)

        const res = await fetch(`/api/inventory?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: InventoryRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load stock')
        }
      } catch {
        toast.error('Failed to load stock')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, branchId, status, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, branchId, status]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product name or SKU…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              <SelectItem value="overstock">Overstock</SelectItem>
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
        </div>
      </div>

      <InventoryTable rows={rows} isLoading={loading} />
    </div>
  )
}
