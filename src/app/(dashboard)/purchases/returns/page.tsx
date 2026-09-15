'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ROUTES } from '@/lib/constants/routes'

// Validation schema for purchase returns list query
const purchaseReturnListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  supplierId: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'DISPATCHED', 'COMPLETED', 'CANCELLED']).optional(),
  sortBy: z.enum(['returnDate', 'returnNumber']).default('returnDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

interface PurchaseReturnWithDetails {
  id: string
  returnNumber: string
  returnDate: string
  status: string
  totalAmount: number
  reason: string
  supplier: { id: string; name: string }
  purchase: { id: string; purchaseNumber: string }
  items: Array<{
    id: string
    product: { id: string; name: string; sku: string }
    quantity: number
    unitCost: number
    totalAmount: number
    reason: string
    batch: { id: string; batchNumber: string } | null
  }>
}

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState<PurchaseReturnWithDetails[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [branchFilter] = useState('')
  const [supplierFilter] = useState('')
  const [sortBy] = useState('returnDate')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')
  const [page] = useState(1)

  const { control } = useForm<z.infer<typeof purchaseReturnListQuerySchema>>({
    resolver: zodResolver(purchaseReturnListQuerySchema),
    defaultValues: {
      page: 1,
      limit: 20,
      sortBy: 'returnDate',
      sortOrder: 'desc',
    },
  })

  const debouncedSearch = useWatch({ control, name: 'search' }) as string

  useEffect(() => {
    const t = setTimeout(() => setSearch(debouncedSearch), 350)
    return () => clearTimeout(t)
  }, [debouncedSearch])

  const load = useCallback(
    async (opts?: { page?: number; reset?: boolean }) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(opts?.reset ? 1 : (opts?.page ?? page)))
        params.set('limit', '20')
        if (search) params.set('search', search)
        if (statusFilter) params.set('status', statusFilter)
        if (branchFilter) params.set('branchId', branchFilter)
        if (supplierFilter) params.set('supplierId', supplierFilter)
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)

        const res = await fetch(`/api/purchase-returns?${params.toString()}`)
        const json = (await res.json()) as {
          success: boolean
          data?: PurchaseReturnWithDetails[]
          pagination?: { page: number; limit: number; total: number; pages: number }
        }
        if (json.success) {
          setReturns(json.data ?? [])
          setPagination(json.pagination ?? { page: 1, limit: 20, total: 0, pages: 0 })
        } else {
          toast.error('Failed to load purchase returns')
        }
      } catch {
        toast.error('Failed to load purchase returns')
      } finally {
        setLoading(false)
      }
    },
    [page, search, statusFilter, branchFilter, supplierFilter, sortBy, sortOrder]
  )

  useEffect(() => {
    void load({ reset: true })
  }, [debouncedSearch, statusFilter, branchFilter, supplierFilter, sortBy, sortOrder])

  if (loading && returns.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading purchase returns...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Returns</h1>
          <p className="text-muted-foreground">Manage returns to suppliers and debit notes</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-2">
          <CardTitle>Purchase Returns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search return number, supplier, reason…"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="DISPATCHED">Dispatched</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.PURCHASES_NEW}>New Return</Link>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Return #</TableHead>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead className="w-[200px]">Supplier</TableHead>
                  <TableHead className="w-[120px]">PO #</TableHead>
                  <TableHead className="w-[120px]">Total</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[200px]">Reason</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-medium">{ret.returnNumber}</TableCell>
                    <TableCell>{ret.returnDate.split('T')[0]}</TableCell>
                    <TableCell>{ret.supplier.name}</TableCell>
                    <TableCell>{ret.purchase.purchaseNumber}</TableCell>
                    <TableCell className="tabular-nums">
                      {ret.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ret.status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : ret.status === 'APPROVED'
                              ? 'bg-blue-100 text-blue-800'
                              : ret.status === 'DISPATCHED'
                                ? 'bg-purple-100 text-purple-800'
                                : ret.status === 'COMPLETED'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {ret.status}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{ret.reason}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${ROUTES.PURCHASE_RETURNS}/${ret.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {Math.max(pagination.pages, 1)} — {pagination.total}{' '}
                returns
              </div>
              <div className="flex gap-2">
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
                  disabled={page >= pagination.pages || loading}
                  onClick={() => load({ page: page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
