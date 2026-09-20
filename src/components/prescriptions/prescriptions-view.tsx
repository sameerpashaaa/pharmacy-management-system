'use client'

// ─────────────────────────────────────────────────────────────
// Component — PrescriptionsView
// Tabbed list with search, status filters, and pagination.
// ─────────────────────────────────────────────────────────────
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import {
  type PrescriptionRow,
  PrescriptionsTable,
} from '@/components/prescriptions/prescriptions-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useToast } from '@/lib/hooks/use-toast'
import type { PrescriptionStatus } from '@/lib/validations/prescription'

interface PaginationState {
  page: number
  limit: number
  total: number
  pages: number
}

interface PrescriptionsViewProps {
  initialRows: PrescriptionRow[]
  initialPagination: PaginationState
  defaultStatus?: PrescriptionStatus | 'ALL'
}

interface ApiResponse {
  success: boolean
  data?: {
    id: string
    prescriptionNumber: string | null
    patientName: string
    patientAge: number | null
    patientPhone: string | null
    doctorName: string | null
    doctorRegNumber: string | null
    prescriptionDate: string | null
    status: PrescriptionStatus
    images?: unknown[]
    approvedBy?: { id: string; name: string } | null
    approvedAt?: string | null
    createdAt: string
  }[]
  pagination?: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export function PrescriptionsView({
  initialRows,
  initialPagination,
  defaultStatus = 'ALL',
}: PrescriptionsViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [rows, setRows] = useState<PrescriptionRow[]>(initialRows)
  const [page, setPage] = useState(initialPagination.page)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [total, setTotal] = useState(initialPagination.total)
  const [loading, setLoading] = useState(false)

  const [status, setStatus] = useState<string>(searchParams.get('status') ?? defaultStatus)
  const [search, setSearch] = useState<string>(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(search, 300)

  const fetchPrescriptions = useCallback(async (p: number, s: string, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '20',
      })
      if (s && s !== 'ALL') params.set('status', s)
      if (q.trim()) params.set('search', q.trim())

      const res = await fetch(`/api/prescriptions?${params.toString()}`)
      const json = (await res.json()) as ApiResponse
      if (json.success && json.data && json.pagination) {
        const mapped: PrescriptionRow[] = json.data.map((rx) => ({
          id: rx.id,
          prescriptionNumber: rx.prescriptionNumber,
          patientName: rx.patientName,
          patientAge: rx.patientAge,
          patientPhone: rx.patientPhone,
          doctorName: rx.doctorName,
          doctorRegNumber: rx.doctorRegNumber,
          prescriptionDate: rx.prescriptionDate,
          status: rx.status,
          imagesCount: rx.images?.length ?? 0,
          approvedBy: rx.approvedBy ?? null,
          approvedAt: rx.approvedAt ?? null,
          createdAt: rx.createdAt,
        }))
        setRows(mapped)
        setPage(json.pagination.page)
        setTotalPages(json.pagination.pages)
        setTotal(json.pagination.total)
      } else {
        toast.error('Failed to load prescriptions')
      }
    } catch {
      toast.error('Failed to load prescriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPrescriptions(1, status, debouncedSearch)
  }, [debouncedSearch, status, fetchPrescriptions])

  const handleStatusChange = (val: string) => {
    setStatus(val)
    const nextParams = new URLSearchParams(searchParams.toString())
    if (val === 'ALL') nextParams.delete('status')
    else nextParams.set('status', val)
    router.replace(`?${nextParams.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={handleStatusChange} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-5 sm:w-auto">
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="PENDING">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
            <TabsTrigger value="DISPENSED">Dispensed</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search patient, doctor, rx #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1">
            <div className="whitespace-nowrap text-xs text-muted-foreground">
              Page {page} of {Math.max(totalPages, 1)} ({total})
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                void fetchPrescriptions(page - 1, status, debouncedSearch)
              }}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => {
                void fetchPrescriptions(page + 1, status, debouncedSearch)
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <PrescriptionsTable rows={rows} isLoading={loading} />
    </div>
  )
}
