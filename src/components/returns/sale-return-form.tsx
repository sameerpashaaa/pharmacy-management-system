'use client'

// ─────────────────────────────────────────────────────────────
// Component — SaleReturnForm
// Interactive return creation interface with item-level restock decisions.
// ─────────────────────────────────────────────────────────────
import { AlertCircle, ArrowLeft, CheckCircle2, RotateCcw, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'

interface SaleItemData {
  id: string
  productName: string
  productSku: string
  quantity: number
  returnedQuantity: number
  unitPrice: string | number
  totalAmount: string | number
  itemBatches?: Array<{
    batchId: string
    batch: {
      id: string
      batchNumber: string
    }
  }>
}

export interface SaleFormData {
  id: string
  invoiceNumber: string
  branchId: string
  saleDate: string | Date
  totalAmount: string | number
  status: string
  customer: {
    id: string
    name: string
    phone: string | null
  } | null
  items: SaleItemData[]
}

interface SaleReturnFormProps {
  initialSale?: SaleFormData | null
}

type RestockOption = 'RESTOCK' | 'QUARANTINE' | 'DAMAGE_WRITE_OFF'
type RefundMethodOption = 'CASH' | 'CARD' | 'UPI' | 'CREDIT'

interface ReturnLineState {
  quantity: number
  restockDecision: RestockOption
}

export function SaleReturnForm({ initialSale }: SaleReturnFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [selectedSale, setSelectedSale] = useState<SaleFormData | null>(initialSale ?? null)
  const [searchInvoice, setSearchInvoice] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Item selections indexed by saleItemId
  const [lines, setLines] = useState<Record<string, ReturnLineState>>({})
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<RefundMethodOption>('CASH')
  const [refundRef, setRefundRef] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSearchSale = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = searchInvoice.trim()
    if (!query) return

    setSearching(true)
    setSearchError(null)

    try {
      const res = await fetch(`/api/sales?search=${encodeURIComponent(query)}&limit=5`)
      const json = (await res.json()) as {
        success: boolean
        data?: Array<{ id: string; invoiceNumber: string }>
        error?: { message: string }
      }

      if (!json.success || !json.data || json.data.length === 0) {
        setSearchError(`No sales found matching invoice '${query}'`)
        setSearching(false)
        return
      }

      // Fetch full sale detail for the top match
      const saleId = json.data[0].id
      const detailRes = await fetch(`/api/sales/${saleId}`)
      const detailJson = (await detailRes.json()) as {
        success: boolean
        data?: SaleFormData
        error?: { message: string }
      }

      if (!detailJson.success || !detailJson.data) {
        setSearchError(detailJson.error?.message ?? 'Failed to load sale details')
      } else {
        setSelectedSale(detailJson.data)
        setLines({})
      }
    } catch {
      setSearchError('Network error searching for sale')
    } finally {
      setSearching(false)
    }
  }

  const handleLineQtyChange = (saleItemId: string, rawQty: number, maxAllowed: number) => {
    const qty = Math.max(0, Math.min(rawQty, maxAllowed))
    setLines((prev) => ({
      ...prev,
      [saleItemId]: {
        quantity: qty,
        restockDecision: prev[saleItemId]?.restockDecision ?? 'RESTOCK',
      },
    }))
  }

  const handleRestockDecisionChange = (saleItemId: string, decision: RestockOption) => {
    setLines((prev) => ({
      ...prev,
      [saleItemId]: {
        quantity: prev[saleItemId]?.quantity ?? 0,
        restockDecision: decision,
      },
    }))
  }

  // Calculate totals
  const activeItems =
    selectedSale?.items
      .map((item) => {
        const lineState = lines[item.id]
        const returnQty = lineState?.quantity ?? 0
        const unitPrice = Number(item.unitPrice)
        const lineTotal = returnQty * unitPrice
        const batchId = item.itemBatches?.[0]?.batchId ?? null
        return {
          saleItemId: item.id,
          productName: item.productName,
          productSku: item.productSku,
          quantity: returnQty,
          unitPrice,
          lineTotal,
          restockDecision: lineState?.restockDecision ?? 'RESTOCK',
          batchId,
        }
      })
      .filter((item) => item.quantity > 0) ?? []

  const totalReturnAmount = activeItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const totalReturnUnits = activeItems.reduce((sum, item) => sum + item.quantity, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSale) {
      toast.error('Please select an invoice to return')
      return
    }

    if (activeItems.length === 0) {
      toast.error('Please enter a return quantity for at least one item')
      return
    }

    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('Please enter a valid return reason (at least 3 characters)')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        saleId: selectedSale.id,
        reason: reason.trim(),
        refundMethod,
        refundRef: refundRef.trim() || undefined,
        notes: notes.trim() || undefined,
        items: activeItems.map((item) => ({
          saleItemId: item.saleItemId,
          quantity: item.quantity,
          restockDecision: item.restockDecision,
          batchId: item.batchId ?? undefined,
        })),
      }

      const res = await fetch('/api/returns/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as {
        success: boolean
        data?: { id: string; returnNumber: string }
        error?: { message: string }
      }

      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to process sales return')
        setSubmitting(false)
        return
      }

      toast.success(`Sales Return ${json.data?.returnNumber ?? ''} processed successfully!`)
      if (json.data?.id) {
        router.push(ROUTES.SALE_RETURN(json.data.id))
      } else {
        router.push(ROUTES.SALE_RETURNS)
      }
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred while processing return')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Process Sales Return</h1>
          <p className="text-muted-foreground">
            Return sold items to inventory, log write-offs, and generate customer refunds or credit
            notes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.SALE_RETURNS} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to returns
          </Link>
        </Button>
      </div>

      {!selectedSale ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Step 1: Locate Customer Invoice</CardTitle>
            <CardDescription>
              Enter the invoice number printed on the customer receipt.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(e) => void handleSearchSale(e)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceSearch">Invoice Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="invoiceSearch"
                    placeholder="e.g. INV-2026-0001"
                    value={searchInvoice}
                    onChange={(e) => setSearchInvoice(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={searching || !searchInvoice.trim()}>
                    <Search className="mr-2 h-4 w-4" />
                    {searching ? 'Searching...' : 'Lookup'}
                  </Button>
                </div>
              </div>
              {searchError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{searchError}</span>
                </div>
              )}
            </CardContent>
          </form>
        </Card>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-lg">Invoice {selectedSale.invoiceNumber}</CardTitle>
                <CardDescription>
                  Date: {formatDateTime(selectedSale.saleDate)} · Customer:{' '}
                  {selectedSale.customer ? selectedSale.customer.name : 'Walk-in'}{' '}
                  {selectedSale.customer?.phone && `(${selectedSale.customer.phone})`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  Original: {formatCurrency(Number(selectedSale.totalAmount))}
                </Badge>
                {!initialSale && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedSale(null)
                      setLines({})
                    }}
                  >
                    Change Sale
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* Line Items selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Items to Return</CardTitle>
              <CardDescription>
                Specify the return quantity and restock disposition for each product line.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 text-center font-medium">Sold</th>
                    <th className="py-2 pr-4 text-center font-medium">Returned</th>
                    <th className="py-2 pr-4 text-center font-medium">Remaining</th>
                    <th className="py-2 pr-4 text-center font-medium">Return Qty</th>
                    <th className="py-2 pr-4 font-medium">Restock Decision</th>
                    <th className="py-2 text-right font-medium">Refund Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item) => {
                    const remaining = item.quantity - (item.returnedQuantity || 0)
                    const isFullyReturned = remaining <= 0
                    const lineState = lines[item.id]
                    const returnQty = lineState?.quantity ?? 0
                    const unitPrice = Number(item.unitPrice)
                    const lineRefund = returnQty * unitPrice
                    const decision = lineState?.restockDecision ?? 'RESTOCK'

                    return (
                      <tr
                        key={item.id}
                        className={`border-b ${isFullyReturned ? 'opacity-40' : ''}`}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.productSku} · Unit Price: {formatCurrency(unitPrice)}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-center tabular-nums">{item.quantity}</td>
                        <td className="py-3 pr-4 text-center tabular-nums">
                          {item.returnedQuantity || 0}
                        </td>
                        <td className="py-3 pr-4 text-center font-semibold tabular-nums">
                          {remaining}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            disabled={isFullyReturned || submitting}
                            value={returnQty === 0 ? '' : returnQty}
                            onChange={(e) =>
                              handleLineQtyChange(
                                item.id,
                                parseInt(e.target.value, 10) || 0,
                                remaining
                              )
                            }
                            placeholder="0"
                            className="mx-auto w-20 text-center"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={decision}
                            disabled={isFullyReturned || returnQty === 0 || submitting}
                            onChange={(e) =>
                              handleRestockDecisionChange(item.id, e.target.value as RestockOption)
                            }
                            aria-label={`Restock decision for ${item.productName}`}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="RESTOCK">Restock (Back to Active Stock)</option>
                            <option value="QUARANTINE">Quarantine (Under Inspection)</option>
                            <option value="DAMAGE_WRITE_OFF">Damaged / Write-Off</option>
                          </select>
                        </td>
                        <td className="py-3 text-right font-medium tabular-nums">
                          {formatCurrency(lineRefund)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Return details & Refund settlement */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Return Details</CardTitle>
                <CardDescription>Document why products are being returned.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Return *</Label>
                  <Input
                    id="reason"
                    placeholder="e.g. Unopened sealed bottle, Patient discontinued medication"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    disabled={submitting}
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      'Unopened / Not needed',
                      'Doctor changed medication',
                      'Adverse reaction / allergic',
                      'Damaged seal / packaging',
                      'Wrong item dispensed',
                    ].map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setReason(preset)}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any observations, batch inspection notes, or approval comments..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    disabled={submitting}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Refund & Settlement</CardTitle>
                <CardDescription>Select how refund is disbursed to the customer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="refundMethod">Refund Method</Label>
                  <select
                    id="refundMethod"
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as RefundMethodOption)}
                    disabled={submitting}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="UPI">UPI Transfer</option>
                    <option value="CARD">Card Reversal</option>
                    <option value="CREDIT">Credit Note (Store Credit)</option>
                  </select>
                </div>

                {refundMethod === 'CREDIT' ? (
                  <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Credit Note will be issued</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      An active Credit Note for {formatCurrency(totalReturnAmount)} valid for 365
                      days will be generated and credited to the customer balance.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="refundRef">Refund Reference / Tx ID (Optional)</Label>
                    <Input
                      id="refundRef"
                      placeholder="e.g. UPI Ref / Cash voucher number"
                      value={refundRef}
                      onChange={(e) => setRefundRef(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                )}

                <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items to Return:</span>
                    <span className="font-medium">{totalReturnUnits} units</span>
                  </div>
                  <div className="flex justify-between text-base font-bold">
                    <span>Total Refund:</span>
                    <span className="tabular-nums text-primary">
                      {formatCurrency(totalReturnAmount)}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting || totalReturnUnits === 0}
                >
                  <RotateCcw className="h-4 w-4" />
                  {submitting
                    ? 'Processing Return...'
                    : `Process Return (${formatCurrency(totalReturnAmount)})`}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </form>
      )}
    </div>
  )
}
