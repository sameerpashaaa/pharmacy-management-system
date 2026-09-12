'use client'

// ─────────────────────────────────────────────────────────────
// Component — AdjustmentsView
// Client container for the stock adjustments page — filters,
// pagination, new adjustment dialog, approve/reject actions.
// ─────────────────────────────────────────────────────────────
import { Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { AdjustmentFormDialog } from '@/components/inventory/adjustment-form'
import {
  AdjustmentsTable,
  type AdjustmentRow,
  type AdjustmentStatus,
  type AdjustmentType,
} from '@/components/inventory/adjustments-table'
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
import { useUiStore } from '@/lib/stores/ui-store'

interface AdjustmentsViewProps {
  initialRows: AdjustmentRow[]
  initialPagination: { page: number; limit: number; total: number; pages: number }
  initialBranchId: string | null
  canAdjust: boolean
  canApprove: boolean
}

interface BranchOption {
  id: string
  name: string
  code: string | null
}

const STATUS_OPTIONS: { value: AdjustmentStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const TYPE_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: 'PHYSICAL_COUNT', label: 'Physical Count' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'THEFT', label: 'Theft' },
  { value: 'EXPIRY', label: 'Expiry' },
  { value: 'CORRECTION', label: 'Correction' },
  { value: 'OPENING_STOCK', label: 'Opening Stock' },
]

export function AdjustmentsView({
  initialRows,
  initialPagination,
  initialBranchId,
  canAdjust,
  canApprove,
}: AdjustmentsViewProps) {
  const toast = useToast()
  const { openConfirmDialog } = useUiStore()

  const [rows, setRows] = useState<AdjustmentRow[]>(initialRows)
  const [totalPages, setTotalPages] = useState(initialPagination.pages)
  const [page, setPage] = useState(initialPagination.page)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [branchId, setBranchId] = useState<string>(initialBranchId ?? 'all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

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
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (typeFilter !== 'all') params.set('adjustmentType', typeFilter)

        const res = await fetch(`/api/inventory/adjustments?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: AdjustmentRow[]
          pagination?: { page: number; total: number; pages: number }
        }
        if (json.success) {
          setRows(json.data ?? [])
          setTotalPages(json.pagination?.pages ?? 1)
          setPage(json.pagination?.page ?? 1)
        } else {
          toast.error('Failed to load adjustments')
        }
      } catch {
        toast.error('Failed to load adjustments')
      } finally {
        setLoading(false)
      }
    },
    [page, debouncedSearch, branchId, statusFilter, typeFilter, toast]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, branchId, statusFilter, typeFilter]) // eslint-disable-line react-hooks/exhaustive-deps, @typescript-eslint/no-floating-promises

  async function approve(row: AdjustmentRow) {
    openConfirmDialog({
      title: 'Approve Adjustment',
      description: `Apply ${row.quantity > 0 ? '+' : ''}${row.quantity} units for "${row.product.name}" at ${row.branch.name}?`,
      variant: 'default',
      onConfirm: async () => {
        const res = await fetch(`/api/inventory/adjustments/${row.id}/approve`, { method: 'POST' })
        if (res.ok) {
          toast.success('Adjustment approved and applied')
          void load()
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
          toast.error(json.error?.message ?? 'Failed to approve')
        }
      },
    })
  }

  async function reject(row: AdjustmentRow) {
    openConfirmDialog({
      title: 'Reject Adjustment',
      description: `Reject this adjustment of ${row.quantity > 0 ? '+' : ''}${row.quantity} units for "${row.product.name}"?`,
      variant: 'destructive',
      onConfirm: async () => {
        const res = await fetch(`/api/inventory/adjustments/${row.id}/reject`, { method: 'POST' })
        if (res.ok) {
          toast.success('Adjustment rejected')
          void load()
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
          toast.error(json.error?.message ?? 'Failed to reject')
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Type</SelectItem>
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
          {canAdjust && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Adjustment
            </Button>
          )}
        </div>
      </div>

      <AdjustmentsTable
        rows={rows}
        isLoading={loading}
        canApprove={canApprove}
        onApprove={approve}
        onReject={reject}
      />

      <AdjustmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultBranchId={initialBranchId}
        onCreated={() => void load({ reset: true })}
      />
    </div>
  )
}
