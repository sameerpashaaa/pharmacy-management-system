'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { CustomersTable, type CustomerRow } from '@/components/customers/customers-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'

interface CustomersViewProps {
  initialRows: CustomerRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
}

export function CustomersView({ initialRows, initialPagination }: CustomersViewProps) {
  const toast = useToast()

  const [rows, setRows] = useState<CustomerRow[]>(initialRows)
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

        const res = await fetch(`/api/customers?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: CustomerRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load customers')
        }
      } catch {
        toast.error('Failed to load customers')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name or contact…"
            className="pl-8"
          />
        </div>
        <Button asChild className="ml-auto">
          <Link href={ROUTES.CUSTOMERS_NEW}>New Customer</Link>
        </Button>
        <div className="flex items-center gap-2">
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
      <CustomersTable rows={rows} isLoading={loading} />
    </div>
  )
}
