'use client'

// ─────────────────────────────────────────────────────────────
// Component — ExpiryView
// Client container for the Expiry Detection pages — search,
// severity filter (expiring only), pagination and the list.
// Mirrors the BatchesView convention used by the Batch module.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  ExpiredBatchesTable,
  ExpiringBatchesTable,
  type ExpiredBatchRow,
  type ExpiringBatchRow,
  type ExpirySeverityRow,
} from '@/components/expiry/expiry-table'
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

type ExpiryViewMode = 'expiring' | 'expired'

interface ExpiryViewProps {
  mode: ExpiryViewMode
  initialRows: ExpiringBatchRow[] | ExpiredBatchRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
}

const SEVERITY_OPTIONS: { value: Exclude<ExpirySeverityRow, ''> | 'all'; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'INFO', label: 'Info' },
]

export function ExpiryView({ mode, initialRows, initialPagination }: ExpiryViewProps) {
  const toast = useToast()
  const endpoint = mode === 'expiring' ? '/api/expiry/expiring' : '/api/expiry/expired'
  const showSeverityFilter = mode === 'expiring'

  const [rows, setRows] = useState<ExpiringBatchRow[] | ExpiredBatchRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
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
        if (showSeverityFilter && severityFilter !== 'all') params.set('severity', severityFilter)

        const res = await fetch(`${endpoint}?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: ExpiringBatchRow[] | ExpiredBatchRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load expiring batches')
        }
      } catch {
        toast.error('Failed to load expiring batches')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, severityFilter, showSeverityFilter, endpoint, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, severityFilter]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batch number, product name or SKU…"
            className="pl-8"
          />
        </div>
        {showSeverityFilter ? (
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Severity</SelectItem>
              {SEVERITY_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
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

      {mode === 'expiring' ? (
        <ExpiringBatchesTable rows={rows as ExpiringBatchRow[]} isLoading={loading} />
      ) : (
        <ExpiredBatchesTable rows={rows as ExpiredBatchRow[]} isLoading={loading} />
      )}
    </div>
  )
}
