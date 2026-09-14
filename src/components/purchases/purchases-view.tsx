'use client'

// ─────────────────────────────────────────────────────────────
// Component — PurchasesView
// Client container for the Purchase Orders list page.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PurchasesTable, type PurchaseRow } from '@/components/purchases/purchases-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'

interface PurchasesViewProps {
  initialRows: PurchaseRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ORDERED', label: 'Ordered' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function PurchasesView({ initialRows, initialPagination }: PurchasesViewProps) {
  const toast = useToast()

  const [rows, setRows] = useState<PurchaseRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(
    async (opts?: { page?: number; reset?: boolean }) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(opts?.reset ? 1 : (opts?.page ?? page)))
        params.set('limit', '20')
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (statusFilter) params.set('status', statusFilter)

        const res = await fetch(`/api/purchases?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: PurchaseRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load purchase orders')
        }
      } catch {
        toast.error('Failed to load purchase orders')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, statusFilter, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO number or supplier…"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            Page {page} of {Math.max(totalPages, 1)}
          </div>
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load({ page: page - 1 })}>
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => load({ page: page + 1 })}>
            Next
          </Button>
        </div>
      </div>
      <PurchasesTable rows={rows} isLoading={loading} />
    </div>
  )
}