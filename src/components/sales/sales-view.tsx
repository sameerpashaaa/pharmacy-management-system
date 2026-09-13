'use client'

// ─────────────────────────────────────────────────────────────
// Component — SalesView
// Client container for the Sales History page — search,
// pagination and the invoice list. Mirrors the BatchesView
// convention used by the Batch module.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { SalesTable, type SalesRow } from '@/components/sales/sales-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'

interface SalesViewProps {
  initialRows: SalesRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
}

export function SalesView({ initialRows, initialPagination }: SalesViewProps) {
  const toast = useToast()

  const [rows, setRows] = useState<SalesRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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

        const res = await fetch(`/api/sales?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: SalesRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load sales')
        }
      } catch {
        toast.error('Failed to load sales')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number or customer…"
            className="pl-8"
          />
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

      <SalesTable rows={rows} isLoading={loading} />
    </div>
  )
}
