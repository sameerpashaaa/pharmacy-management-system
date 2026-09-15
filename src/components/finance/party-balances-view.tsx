'use client'

import { Eye, ReceiptIndianRupee, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatCurrency } from '@/lib/utils/currency'

export interface PartyBalanceRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  outstandingBalance: number
  creditDays: number
  isActive: boolean
}

interface StatementEntry {
  id: string
  type: string
  amount: number
  balance: number
  description: string
  referenceType: string | null
  referenceId: string | null
  entryDate: string
}

interface PartyBalancesViewProps {
  title: string
  description: string
  balanceLabel: string
  rows: PartyBalanceRow[]
  isSupplier?: boolean
}

export function PartyBalancesView({
  title,
  description,
  balanceLabel,
  rows,
  isSupplier = false,
}: PartyBalancesViewProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState<'ALL' | 'OUTSTANDING' | 'CLEAR'>('ALL')

  // Payment state
  const [selectedParty, setSelectedParty] = React.useState<PartyBalanceRow | null>(null)
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [paymentLoading, setPaymentLoading] = React.useState(false)
  const [paymentForm, setPaymentForm] = React.useState({
    amount: 0,
    paymentMethod: 'CASH',
    reference: '',
    notes: '',
  })

  // Statement state
  const [statementOpen, setStatementOpen] = React.useState(false)
  const [statementLoading, setStatementLoading] = React.useState(false)
  const [statementParty, setStatementParty] = React.useState<PartyBalanceRow | null>(null)
  const [statementEntries, setStatementEntries] = React.useState<StatementEntry[]>([])

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.phone && row.phone.includes(searchTerm)) ||
        (row.city && row.city.toLowerCase().includes(searchTerm.toLowerCase()))
      if (!matchesSearch) return false

      if (filterStatus === 'OUTSTANDING') return row.outstandingBalance > 0
      if (filterStatus === 'CLEAR') return row.outstandingBalance <= 0
      return true
    })
  }, [rows, searchTerm, filterStatus])

  const totalOutstanding = rows.reduce((sum, row) => sum + row.outstandingBalance, 0)
  const activeRows = rows.filter((row) => row.isActive).length

  const openPaymentModal = (party: PartyBalanceRow) => {
    setSelectedParty(party)
    setPaymentForm({
      amount: party.outstandingBalance > 0 ? party.outstandingBalance : 0,
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    })
    setPaymentOpen(true)
  }

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedParty || paymentForm.amount <= 0) {
      toast.error('Please enter a positive payment amount')
      return
    }

    setPaymentLoading(true)
    const endpoint = isSupplier
      ? `/api/finance/payables/${selectedParty.id}/payments`
      : `/api/finance/receivables/${selectedParty.id}/payments`

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm),
      })
      const data = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        throw new Error(data.error?.message || 'Payment failed')
      }
      toast.success(
        `Payment of ${formatCurrency(paymentForm.amount)} recorded for ${selectedParty.name}`
      )
      setPaymentOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error recording payment')
    } finally {
      setPaymentLoading(false)
    }
  }

  const openStatementModal = async (party: PartyBalanceRow) => {
    setStatementParty(party)
    setStatementOpen(true)
    setStatementLoading(true)

    const endpoint = isSupplier
      ? `/api/finance/payables/${party.id}`
      : `/api/finance/receivables/${party.id}`

    try {
      const res = await fetch(endpoint)
      const data = (await res.json()) as { entries?: StatementEntry[] }
      if (res.ok && data.entries) {
        setStatementEntries(data.entries)
      } else {
        setStatementEntries([])
      }
    } catch {
      setStatementEntries([])
      toast.error('Failed to load statement history')
    } finally {
      setStatementLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {formatCurrency(totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground">Across all accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
            <p className="text-xs text-muted-foreground">
              {rows.filter((r) => r.outstandingBalance > 0).length} with active balance
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{activeRows}</div>
            <p className="text-xs text-muted-foreground">Available for billing & transactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filterStatus === 'ALL' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('ALL')}
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'OUTSTANDING' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('OUTSTANDING')}
          >
            Outstanding
          </Button>
          <Button
            variant={filterStatus === 'CLEAR' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('CLEAR')}
          >
            Clear
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{balanceLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Credit Days</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No matching party balances found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.phone || row.email || '—'}
                    </TableCell>
                    <TableCell className="text-xs">{row.city || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={row.isActive ? 'default' : 'secondary'} className="text-xs">
                        {row.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {row.creditDays} d
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        row.outstandingBalance > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'
                      }`}
                    >
                      {formatCurrency(row.outstandingBalance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View Statement"
                          onClick={() => openStatementModal(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPaymentModal(row)}
                        >
                          <ReceiptIndianRupee className="mr-1 h-3.5 w-3.5" />
                          Settle
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Record Payment Settlement Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment Settlement</DialogTitle>
            <DialogDescription>
              {isSupplier
                ? `Record payment made to supplier "${selectedParty?.name}".`
                : `Record payment collection from customer "${selectedParty?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Balance:</span>
                <span className="font-semibold text-destructive">
                  {formatCurrency(selectedParty?.outstandingBalance ?? 0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payAmount">Payment Amount (₹)</Label>
              <Input
                id="payAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount || ''}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payMethod">Payment Mode</Label>
              <Select
                value={paymentForm.paymentMethod}
                onValueChange={(val) => setPaymentForm({ ...paymentForm, paymentMethod: val })}
              >
                <SelectTrigger id="payMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="NETBANKING">Net Banking</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payRef">Reference / Transaction ID</Label>
              <Input
                id="payRef"
                placeholder="e.g. UPI Ref / Cheque No."
                value={paymentForm.reference}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, reference: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payNotes">Notes</Label>
              <Input
                id="payNotes"
                placeholder="Optional memo"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={paymentLoading}>
                {paymentLoading ? 'Recording...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Statement Dialog */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ledger Statement — {statementParty?.name}</DialogTitle>
            <DialogDescription>
              Recent transaction history and running balance.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {statementLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading history...</p>
            ) : statementEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No ledger entries recorded for this party yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">
                        {new Date(entry.entryDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entry.description}</TableCell>
                      <TableCell>
                        <Badge
                          variant={entry.type === 'DEBIT' ? 'destructive' : 'default'}
                          className="text-[10px]"
                        >
                          {entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums font-medium">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums font-semibold">
                        {formatCurrency(entry.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setStatementOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}