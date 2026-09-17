'use client'

import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Landmark,
  PlusCircle,
  ReceiptIndianRupee,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { FinanceSummary } from '@/lib/finance/finance-service'
import { formatCurrency } from '@/lib/utils/currency'

export interface LedgerRow {
  id: string
  code: string
  name: string
  type: string
  balance: number
  entriesCount: number
}

interface FinanceOverviewProps {
  summary: FinanceSummary
  ledgers: LedgerRow[]
}

export function FinanceOverview({ summary, ledgers }: FinanceOverviewProps) {
  const router = useRouter()
  const [isCreatingLedger, setIsCreatingLedger] = React.useState(false)
  const [ledgerLoading, setLedgerLoading] = React.useState(false)
  const [newLedger, setNewLedger] = React.useState({
    code: '',
    name: '',
    type: 'ASSET',
    openingBalance: 0,
  })

  const [isCreatingEntry, setIsCreatingEntry] = React.useState(false)
  const [entryLoading, setEntryLoading] = React.useState(false)
  const [newEntry, setNewEntry] = React.useState({
    ledgerId: '',
    type: 'DEBIT',
    amount: 0,
    description: '',
  })

  const handleCreateLedger = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLedger.code || !newLedger.name) {
      toast.error('Ledger code and name are required')
      return
    }

    setLedgerLoading(true)
    try {
      const res = await fetch('/api/finance/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLedger),
      })
      const data = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create ledger')
      }
      toast.success(`Ledger "${newLedger.name}" created successfully`)
      setIsCreatingLedger(false)
      setNewLedger({ code: '', name: '', type: 'ASSET', openingBalance: 0 })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creating ledger')
    } finally {
      setLedgerLoading(false)
    }
  }

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEntry.ledgerId || newEntry.amount <= 0 || !newEntry.description) {
      toast.error('Please fill in all required fields with a positive amount')
      return
    }

    setEntryLoading(true)
    try {
      const res = await fetch('/api/finance/ledger-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      })
      const data = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to post entry')
      }
      toast.success('Journal entry posted successfully')
      setIsCreatingEntry(false)
      setNewEntry({ ledgerId: '', type: 'DEBIT', amount: 0, description: '' })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error posting entry')
    } finally {
      setEntryLoading(false)
    }
  }

  const cards = [
    {
      title: 'Sales',
      value: formatCurrency(summary.sales),
      note: 'Completed, non-cancelled invoices',
      icon: ArrowUpRight,
    },
    {
      title: 'Purchases',
      value: formatCurrency(summary.purchases),
      note: 'Active purchase value',
      icon: ArrowDownRight,
    },
    {
      title: 'Receivables',
      value: formatCurrency(summary.customerReceivables),
      note: 'Customer outstanding',
      icon: Landmark,
    },
    {
      title: 'Net GST Payable',
      value: formatCurrency(summary.netGstPayable),
      note: 'Output tax less input tax',
      icon: ReceiptIndianRupee,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Management</h1>
          <p className="text-muted-foreground">
            Track ledgers, outstanding balances, collections, and tax position.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={isCreatingLedger} onOpenChange={setIsCreatingLedger}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Ledger Account</DialogTitle>
                <DialogDescription>
                  Create a new account in your Chart of Accounts.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateLedger} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Account Code</Label>
                  <Input
                    id="code"
                    placeholder="e.g. 1060"
                    value={newLedger.code}
                    onChange={(e) => setNewLedger({ ...newLedger, code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Account Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Petty Cash"
                    value={newLedger.name}
                    onChange={(e) => setNewLedger({ ...newLedger, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Account Type</Label>
                  <Select
                    value={newLedger.type}
                    onValueChange={(val) => setNewLedger({ ...newLedger, type: val })}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASSET">ASSET</SelectItem>
                      <SelectItem value="LIABILITY">LIABILITY</SelectItem>
                      <SelectItem value="EQUITY">EQUITY</SelectItem>
                      <SelectItem value="INCOME">INCOME</SelectItem>
                      <SelectItem value="EXPENSE">EXPENSE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Opening Balance (₹)</Label>
                  <Input
                    id="openingBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLedger.openingBalance || ''}
                    onChange={(e) =>
                      setNewLedger({ ...newLedger, openingBalance: Number(e.target.value) })
                    }
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreatingLedger(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={ledgerLoading}>
                    {ledgerLoading ? 'Creating...' : 'Save Account'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreatingEntry} onOpenChange={setIsCreatingEntry}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <BookOpen className="mr-2 h-4 w-4" />
                Journal Entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Journal Entry</DialogTitle>
                <DialogDescription>
                  Record a manual debit or credit adjustment to a ledger.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateEntry} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ledger">Target Ledger</Label>
                  <Select
                    value={newEntry.ledgerId}
                    onValueChange={(val) => setNewEntry({ ...newEntry, ledgerId: val })}
                  >
                    <SelectTrigger id="ledger">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {ledgers.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.code} - {l.name} ({formatCurrency(l.balance)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entryType">Entry Type</Label>
                    <Select
                      value={newEntry.type}
                      onValueChange={(val) => setNewEntry({ ...newEntry, type: val })}
                    >
                      <SelectTrigger id="entryType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">DEBIT</SelectItem>
                        <SelectItem value="CREDIT">CREDIT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (₹)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={newEntry.amount || ''}
                      onChange={(e) => setNewEntry({ ...newEntry, amount: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description / Memo</Label>
                  <Input
                    id="description"
                    placeholder="e.g. Monthly maintenance adjustment"
                    value={newEntry.description}
                    onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreatingEntry(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={entryLoading}>
                    {entryLoading ? 'Posting...' : 'Post Entry'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button asChild variant="outline" size="sm">
            <Link href="/finance/receivables">Receivables</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/payables">Payables</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/gst">GST & Taxes</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.note}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cash Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">
              {formatCurrency(summary.cashCollected)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Supplier Payables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">
              {formatCurrency(summary.supplierPayables)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">GST Collected / Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">
              {formatCurrency(summary.taxCollected)} / {formatCurrency(summary.taxPaid)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Chart of Accounts</CardTitle>
            <p className="text-xs text-muted-foreground">
              Master ledger accounts and active balances.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Ledger</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No ledgers have been created yet.
                  </TableCell>
                </TableRow>
              ) : (
                ledgers.map((ledger) => (
                  <TableRow key={ledger.id}>
                    <TableCell className="font-mono text-xs font-semibold">{ledger.code}</TableCell>
                    <TableCell className="font-medium">{ledger.name}</TableCell>
                    <TableCell className="text-xs">{ledger.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledger.entriesCount}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(ledger.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
