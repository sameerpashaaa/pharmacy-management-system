'use client'

// ─────────────────────────────────────────────────────────────
// Component — CustomerTable
// Server-driven pagination + search. Direct table (not DataTable)
// so we can wire real pagination + delete confirm from the parent.
// ─────────────────────────────────────────────────────────────
import { Building2, Edit, Mail, MapPin, Phone, Plus, Power, Search, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/lib/hooks/use-toast'
import { useUiStore } from '@/lib/stores/ui-store'
import { formatCurrency } from '@/lib/utils/currency'

export interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  creditLimit: number
  outstandingBalance: number
  creditDays: number
  isActive: boolean
  notes: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

interface CustomerTableProps {
  customers: CustomerRow[]
  pagination: Pagination
  isLoading?: boolean
  onPageChange: (page: number) => void
  onSearch: (query: string) => void
  onAddCustomer?: () => void
  onEditCustomer?: (customer: CustomerRow) => void
  onRefresh?: () => void
}

export function CustomerTable({
  customers,
  pagination,
  isLoading,
  onPageChange,
  onSearch,
  onAddCustomer,
  onEditCustomer,
  onRefresh,
}: CustomerTableProps) {
  const [searchInput, setSearchInput] = useState('')
  const { openConfirmDialog } = useUiStore()
  const toast = useToast()

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault()
    onSearch(searchInput.trim())
  }

  const handleToggleActive = useCallback(
    (customer: CustomerRow) => {
      const action = customer.isActive ? 'deactivate' : 'activate'
      openConfirmDialog({
        title: `${customer.isActive ? 'Deactivate' : 'Activate'} Customer`,
        description: `${customer.isActive ? 'Deactivate' : 'Activate'} "${customer.name}"? Existing sales remain linked.`,
        variant: customer.isActive ? 'destructive' : 'default',
        onConfirm: async () => {
          const res = await fetch(`/api/customers/${customer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !customer.isActive }),
          })
          if (res.ok) {
            toast.success(`Customer ${action}d`)
            onRefresh?.()
          } else {
            const json = (await res.json().catch(() => null)) as {
              error?: { message?: string }
            } | null
            toast.error(json?.error?.message ?? `Failed to ${action} customer`)
          }
        },
      })
    },
    [openConfirmDialog, toast, onRefresh]
  )

  const handleDelete = useCallback(
    (customer: CustomerRow) => {
      openConfirmDialog({
        title: 'Delete Customer',
        description: `Permanently delete "${customer.name}"? Fails if the customer is linked to any sales, prescriptions, returns, payments or ledger entries.`,
        variant: 'destructive',
        onConfirm: async () => {
          const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' })
          if (res.ok) {
            toast.success('Customer deleted')
            onRefresh?.()
          } else {
            const json = (await res.json().catch(() => null)) as {
              error?: { message?: string }
            } | null
            toast.error(json?.error?.message ?? 'Failed to delete customer')
          }
        },
      })
    },
    [openConfirmDialog, toast, onRefresh]
  )

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <form onSubmit={onSubmitSearch} className="flex flex-1 items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, phone, email, city, GSTIN…"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          {onAddCustomer && (
            <Button size="sm" onClick={onAddCustomer}>
              <Plus className="mr-2 h-4 w-4" /> New Customer
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No customers found. Add a customer to get started.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.gstin && (
                            <p className="font-mono text-xs text-muted-foreground">
                              GSTIN: {c.gstin}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        {c.phone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </p>
                        )}
                        {c.email && (
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{c.email}</span>
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(c.city || c.state) && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[c.city, c.state, c.pincode].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <div>{formatCurrency(c.creditLimit)}</div>
                      <div className="text-muted-foreground">{c.creditDays} days</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <span className={c.outstandingBalance > 0 ? 'font-semibold' : ''}>
                        {formatCurrency(c.outstandingBalance)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? 'success' : 'destructive'}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {onEditCustomer && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEditCustomer(c)}
                            title="Edit customer"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleToggleActive(c)}
                          title={c.isActive ? 'Deactivate customer' : 'Activate customer'}
                        >
                          <Power
                            className={`h-3.5 w-3.5 ${
                              c.isActive ? 'text-destructive' : 'text-green-600'
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(c)}
                          title="Delete customer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {pagination.page} of {pagination.pages} · {pagination.total} customers
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
