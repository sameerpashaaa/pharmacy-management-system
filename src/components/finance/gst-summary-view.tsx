'use client'

import {
  FileCheck2,
  FileSpreadsheet,
  ReceiptText,
  RefreshCw,
  Scale,
} from 'lucide-react'
import Link from 'next/link'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { GstSummary } from '@/lib/finance/finance-service'
import { formatCurrency } from '@/lib/utils/currency'

interface Gstr1B2BInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  partyName: string | null
  partyGstin: string | null
  partyState: string | null
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
  isFiled: boolean
}

interface Gstr1B2CInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  partyName: string | null
  partyState: string | null
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
  isFiled: boolean
}

interface Gstr1HsnRow {
  hsnCode: string
  transactionCount: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
}

interface Gstr1Data {
  returnPeriod: string
  summary: {
    transactionCount: number
    taxableAmount: number
    cgstAmount: number
    sgstAmount: number
    igstAmount: number
    totalTax: number
    totalAmount: number
  }
  b2b: Gstr1B2BInvoice[]
  b2c: Gstr1B2CInvoice[]
  hsnSummary: Gstr1HsnRow[]
}

interface Gstr3bTable31 {
  title: string
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  invoiceCount: number
}

interface Gstr3bTable4 {
  title: string
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  invoiceCount: number
}

interface Gstr3bTable6 {
  title: string
  netCgstPayable: number
  netSgstPayable: number
  netIgstPayable: number
  netTotalPayable: number
}

interface Gstr3bData {
  returnPeriod: string
  table31OutwardSupplies: Gstr3bTable31
  table4EligibleItc: Gstr3bTable4
  table6PaymentOfTax: Gstr3bTable6
}

interface GstSummaryViewProps {
  summary: GstSummary
  title?: string
  description?: string
  showReportAction?: boolean
}

export function GstSummaryView({
  summary,
  title = 'GST & Tax Management',
  description = 'Monitor output tax, input tax, HSN summaries, and filing readiness.',
  showReportAction = true,
}: GstSummaryViewProps) {
  const router = useRouter()
  const [syncLoading, setSyncLoading] = React.useState(false)
  const [fileDialogOpen, setFileDialogOpen] = React.useState(false)
  const [fileLoading, setFileLoading] = React.useState(false)
  const [returnPeriod, setReturnPeriod] = React.useState(() => {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
  })

  // Tabbed reports state
  const [activeTab, setActiveTab] = React.useState('overview')
  const [gstr1Data, setGstr1Data] = React.useState<Gstr1Data | null>(null)
  const [gstr1Loading, setGstr1Loading] = React.useState(false)
  const [gstr3bData, setGstr3bData] = React.useState<Gstr3bData | null>(null)
  const [gstr3bLoading, setGstr3bLoading] = React.useState(false)

  const handleSyncTransactions = async () => {
    setSyncLoading(true)
    try {
      const res = await fetch('/api/gst/sync', { method: 'POST' })
      const data = (await res.json()) as {
        data: { syncedSales: number; syncedPurchases: number }
        error?: { message?: string }
      }
      if (!res.ok) throw new Error(data.error?.message || 'Sync failed')
      toast.success(
        `GST Sync complete: ${data.data.syncedSales} sales and ${data.data.syncedPurchases} purchases synced`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error syncing transactions')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleFileReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    setFileLoading(true)
    try {
      const res = await fetch('/api/gst/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPeriod }),
      })
      const data = (await res.json()) as {
        data: { updatedCount: number }
        error?: { message?: string }
      }
      if (!res.ok) throw new Error(data.error?.message || 'Filing failed')
      toast.success(
        `Period ${returnPeriod} filed successfully (${data.data.updatedCount} transactions marked filed)`
      )
      setFileDialogOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error filing return')
    } finally {
      setFileLoading(false)
    }
  }

  const loadGstr1 = async () => {
    if (gstr1Data) return
    setGstr1Loading(true)
    try {
      const res = await fetch(`/api/gst/reports/gstr1?returnPeriod=${returnPeriod}`)
      const data = (await res.json()) as { data: Gstr1Data }
      if (res.ok) setGstr1Data(data.data)
    } catch {
      toast.error('Failed to load GSTR-1 data')
    } finally {
      setGstr1Loading(false)
    }
  }

  const loadGstr3b = async () => {
    if (gstr3bData) return
    setGstr3bLoading(true)
    try {
      const res = await fetch(`/api/gst/reports/gstr3b?returnPeriod=${returnPeriod}`)
      const data = (await res.json()) as { data: Gstr3bData }
      if (res.ok) setGstr3bData(data.data)
    } catch {
      toast.error('Failed to load GSTR-3B data')
    } finally {
      setGstr3bLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncTransactions}
            disabled={syncLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
            {syncLoading ? 'Syncing...' : 'Sync Transactions'}
          </Button>

          <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <FileCheck2 className="mr-2 h-4 w-4" />
                File Period
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>File GST Return Period</DialogTitle>
                <DialogDescription>
                  Lock and mark all GST transactions for the return period as filed.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleFileReturn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="period">Return Period (MM-YYYY)</Label>
                  <Input
                    id="period"
                    placeholder="e.g. 09-2026"
                    value={returnPeriod}
                    onChange={(e) => setReturnPeriod(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFileDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={fileLoading}>
                    {fileLoading ? 'Filing...' : 'Confirm Filing'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {showReportAction && (
            <Button asChild variant="outline" size="sm">
              <Link href="/gst/reports">GST Reports</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxable Value</CardTitle>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.taxableAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.transactionCount} GST transactions recorded
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total GST</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.totalTax)}
            </div>
            <p className="text-xs text-muted-foreground">
              CGST {formatCurrency(summary.cgstAmount)} · SGST {formatCurrency(summary.sgstAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoice Value</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              IGST {formatCurrency(summary.igstAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          setActiveTab(val)
          if (val === 'gstr1') void loadGstr1()
          if (val === 'gstr3b') void loadGstr3b()
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gstr1">GSTR-1 (Outward)</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B (Summary & ITC)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">GST by Transaction Type</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byType.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          No GST transactions grouped yet. Click &quot;Sync Transactions&quot; to import.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.byType.map((row) => (
                        <TableRow key={row.type}>
                          <TableCell>
                            <Badge variant="outline">{row.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.transactionCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.taxableAmount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.totalTax)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(row.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">HSN Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HSN Code</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byHsn.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          No HSN lines recorded. Click &quot;Sync Transactions&quot; to import.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.byHsn.map((row) => (
                        <TableRow key={row.hsnCode ?? 'none'}>
                          <TableCell className="font-mono text-xs">
                            {row.hsnCode ?? 'Unmapped'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.transactionCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.taxableAmount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.totalTax)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(row.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gstr1" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">GSTR-1 Outward Supplies</CardTitle>
                <p className="text-xs text-muted-foreground">
                  B2B invoices, B2C supplies, and HSN summary for period {returnPeriod}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadGstr1()}>
                Refresh GSTR-1
              </Button>
            </CardHeader>
            <CardContent>
              {gstr1Loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Generating GSTR-1 report...
                </p>
              ) : !gstr1Data || gstr1Data.summary.transactionCount === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No outward sales transactions in GSTR-1. Sync transactions to populate.
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">4A, 4B, 6B — B2B Invoices</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>GSTIN</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1Data.b2b.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-16 text-center text-xs text-muted-foreground">
                              No B2B invoices in this period.
                            </TableCell>
                          </TableRow>
                        ) : (
                          gstr1Data.b2b.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                              <TableCell className="text-xs">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                              <TableCell className="font-mono text-xs">{inv.partyGstin}</TableCell>
                              <TableCell className="text-xs font-medium">{inv.partyName}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatCurrency(inv.taxableAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatCurrency(inv.cgstAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatCurrency(inv.sgstAmount)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-xs">{formatCurrency(inv.totalAmount)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">7 — B2C (Small / Walk-in) Supplies</h4>
                    <div className="rounded-md border p-4 text-sm">
                      <div className="flex justify-between">
                        <span>Total B2C Invoices:</span>
                        <span className="font-semibold tabular-nums">{gstr1Data.b2c.length}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span>B2C Taxable Value:</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(
                            gstr1Data.b2c.reduce((sum, r) => sum + r.taxableAmount, 0)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span>B2C Total Tax:</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(
                            gstr1Data.b2c.reduce((sum, r) => sum + r.totalTax, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gstr3b" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">GSTR-3B Monthly Return</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Summary of Outward Supplies, Eligible Input Tax Credit (ITC), and Net Tax Payable
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadGstr3b()}>
                Refresh GSTR-3B
              </Button>
            </CardHeader>
            <CardContent>
              {gstr3bLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Generating GSTR-3B report...
                </p>
              ) : !gstr3bData ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No GSTR-3B data available.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Table 3.1 Outward Supplies */}
                  <div className="rounded-lg border p-4">
                    <h4 className="font-semibold text-sm mb-3">
                      3.1 Details of Outward Supplies (Sales)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Taxable Value</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table31OutwardSupplies.taxableAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">CGST (Output)</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table31OutwardSupplies.cgstAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">SGST (Output)</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table31OutwardSupplies.sgstAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Total Tax</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table31OutwardSupplies.totalTax)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Table 4 Eligible ITC */}
                  <div className="rounded-lg border p-4">
                    <h4 className="font-semibold text-sm mb-3">
                      4. Eligible Input Tax Credit (ITC - Purchases)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Purchase Value</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table4EligibleItc.taxableAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">CGST (Input)</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table4EligibleItc.cgstAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">SGST (Input)</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table4EligibleItc.sgstAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Total ITC</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table4EligibleItc.totalTax)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Table 6 Net Tax Payable */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <h4 className="font-semibold text-sm mb-3 text-primary">
                      6. Payment of Tax — Net Tax Payable (Output Tax - ITC)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Net CGST Payable</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table6PaymentOfTax.netCgstPayable)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Net SGST Payable</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table6PaymentOfTax.netSgstPayable)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Net IGST Payable</span>
                        <span className="font-bold tabular-nums">
                          {formatCurrency(gstr3bData.table6PaymentOfTax.netIgstPayable)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Total Net Due</span>
                        <span className="font-bold tabular-nums text-destructive">
                          {formatCurrency(gstr3bData.table6PaymentOfTax.netTotalPayable)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}