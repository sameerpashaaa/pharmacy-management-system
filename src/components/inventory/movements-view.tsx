'use client'

// ─────────────────────────────────────────────────────────────
// Component — MovementsView
// Client container for the stock movements page — managed
// search, branch/type filters, and pagination.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  MovementsTable,
  type MovementRow,
  type MovementType,
} from '@/components/inventory/movements-table'
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

interface MovementsViewProps {
  initialRows: MovementRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
  initialBranchId: string | null
}

interface BranchOption {
  id: string
  name: string
  code: string | null
}

const TYPE_OPTIONS: { value: MovementType; label: string }[] = [
  { value: 'IN', label: 'Stock In' },
  { value: 'OUT', label: 'Stock Out' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'RETURN_IN', label: 'Customer Return' },
  { value: 'RETURN_OUT', label: 'Supplier Return' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'WRITE_OFF', label: 'Write-off' },
]

export function MovementsView({
  initialRows,
  initialPagination,
  initialBranchId,
}: MovementsViewProps) {
  const toast = useToast()

  const [rows, setRows] = useState<MovementRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [branchId, setBranchId] = useState<string>(initialBranchId ?? 'all')
  const [type, setType] = useState<string>('all')
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
        if (type !== 'all') params.set('type', type)

        const res = await fetch(`/api/inventory/movements?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: MovementRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load movements')
        }
      } catch {
        toast.error('Failed to load movements')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, branchId, type, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, branchId, type]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

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
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
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

      <MovementsTable rows={rows} isLoading={loading} />
    </div>
  )
}
