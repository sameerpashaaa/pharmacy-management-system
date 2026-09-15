'use client'

// ─────────────────────────────────────────────────────────────
// Component — PurchaseReturnForm
// Interactive return-to-vendor (RTV) creation form.
// ─────────────────────────────────────────────────────────────
import { AlertCircle, ArrowLeft, RotateCcw, Search } from 'lucide-react'
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
import { formatDate } from '@/lib/utils/date'

export interface PurchaseItemData {
  id: string
  productId: string
  productName: string
  productSku: string
  receivedQuantity: number
  unitCost: number
  batchId?: string | null
}

export interface PurchaseFormData {
  id: string
  purchaseNumber: string
  supplierId: string
  supplier: { id: string; name: string }
  purchaseDate: string | Date
  status: string
  items: PurchaseItemData[]
}

interface PurchaseReturnFormProps {
  initialPurchase?: PurchaseFormData | null
}

interface ReturnLineState {
  quantity: number
  reason: string
}

export function PurchaseReturnForm({ initialPurchase }: PurchaseReturnFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseFormData | null>(
    initialPurchase ?? null
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [lines, setLines] = useState<Record<string, ReturnLineState>>({})
  const [reason, setReason] = useState('')
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSearchPurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return

    setSearching(true)
    setSearchError(null)

    try {
      const res = await fetch(`/api/purchases?search=${encodeURIComponent(q)}&limit=5`)
      const json = (await res.json()) as {
        success: boolean
        data?: Array<{ id: string; purchaseNumber: string; status: string }>
        error?: { message: string }
      }

      if (!json.success || !json.data || json.data.length === 0) {
        setSearchError(`No purchase order found matching '${q}'`)
        setSearching(false)
        return
      }

      const match = json.data[0]
      if (!['RECEIVED', 'INVOICED', 'PARTIALLY_RECEIVED'].includes(match.status)) {
        setSearchError(
          `Purchase ${match.purchaseNumber} has status '${match.status}'. Only received orders can be returned.`
        )
        setSearching(false)
        return
      }

      const detailRes = await fetch(`/api/purchases/${match.id}`)
      const detailJson = (await detailRes.json()) as {
        success: boolean
        data?: {
          id: string
          purchaseNumber: string
          supplierId: string
          supplier: { id: string; name: string }
          purchaseDate: string
          status: string
          items: Array<{
            id: string
            productId: string
            receivedQuantity: number
            unitCost: number
            batchId?: string | null
            product: { id: string; name: string; sku: string }
          }>
        }
        error?: { message: string }
      }

      if (!detailJson.success || !detailJson.data) {
        setSearchError(detailJson.error?.message ?? 'Failed to load purchase details')
      } else {
        setSelectedPurchase({
          id: detailJson.data.id,
          purchaseNumber: detailJson.data.purchaseNumber,
          supplierId: detailJson.data.supplierId,
          supplier: detailJson.data.supplier,
          purchaseDate: detailJson.data.purchaseDate,
          status: detailJson.data.status,
          items: detailJson.data.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productName: it.product.name,
            productSku: it.product.sku,
            receivedQuantity: it.receivedQuantity,
            unitCost: Number(it.unitCost),
            batchId: it.batchId,
          })),
        })
        setLines({})
      }
    } catch {
      setSearchError('Network error searching for purchase order')
    } finally {
      setSearching(false)
    }
  }

  const handleLineQtyChange = (itemId: string, rawQty: number, maxAllowed: number) => {
    const qty = Math.max(0, Math.min(rawQty, maxAllowed))
    setLines((prev) => ({
      ...prev,
      [itemId]: {
        quantity: qty,
        reason: prev[itemId]?.reason ?? 'Returned to supplier',
      },
    }))
  }

  const handleLineReasonChange = (itemId: string, lineReason: string) => {
    setLines((prev) => ({
      ...prev,
      [itemId]: {
        quantity: prev[itemId]?.quantity ?? 0,
        reason: lineReason,
      },
    }))
  }

  const activeItems =
    selectedPurchase?.items
      .map((item) => {
        const lineState = lines[item.id]
        const returnQty = lineState?.quantity ?? 0
        const lineTotal = returnQty * item.unitCost
        return {
          purchaseItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: returnQty,
          unitCost: item.unitCost,
          lineTotal,
          reason: lineState?.reason || 'Vendor return',
          batchId: item.batchId ?? undefined,
        }
      })
      .filter((item) => item.quantity > 0) ?? []

  const totalReturnUnits = activeItems.reduce((sum, i) => sum + i.quantity, 0)
  const totalReturnAmount = activeItems.reduce((sum, i) => sum + i.lineTotal, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPurchase) {
      toast.error('Please select a purchase order')
      return
    }

    if (activeItems.length === 0) {
      toast.error('Please specify return quantity for at least one item')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for return to vendor')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        purchaseId: selectedPurchase.id,
        supplierId: selectedPurchase.supplierId,
        returnDate: new Date(returnDate).toISOString(),
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        items: activeItems.map((item) => ({
          purchaseItemId: item.purchaseItemId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          reason: item.reason,
          batchId: item.batchId,
        })),
      }

      const res = await fetch('/api/purchase-returns', {
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
        toast.error(json.error?.message ?? 'Failed to process purchase return')
        setSubmitting(false)
        return
      }

      toast.success(`Purchase Return ${json.data?.returnNumber ?? ''} created successfully!`)
      if (json.data?.id) {
        router.push(ROUTES.PURCHASE_RETURN(json.data.id))
      } else {
        router.push(ROUTES.PURCHASE_RETURNS)
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
          <h1 className="text-2xl font-bold tracking-tight">Return to Vendor (RTV)</h1>
          <p className="text-muted-foreground">
            Return received stock back to supplier, deduct inventory, and debit supplier ledger.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PURCHASE_RETURNS} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to purchase returns
          </Link>
        </Button>
      </div>

      {!selectedPurchase ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Step 1: Locate Purchase Order</CardTitle>
            <CardDescription>
              Enter the PO number of the received goods you want to return.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(e) => void handleSearchPurchase(e)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="poSearch">Purchase Order Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="poSearch"
                    placeholder="e.g. PO-2026-0001"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={searching || !searchQuery.trim()}>
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
                <CardTitle className="text-lg">
                  Purchase Order {selectedPurchase.purchaseNumber}
                </CardTitle>
                <CardDescription>
                  Supplier: {selectedPurchase.supplier.name} · PO Date:{' '}
                  {formatDate(selectedPurchase.purchaseDate)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selectedPurchase.status}</Badge>
                {!initialPurchase && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPurchase(null)
                      setLines({})
                    }}
                  >
                    Change PO
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* Items selection */}
          <Card>
            <CardHeader>
              <CardTitle>Items to Return</CardTitle>
              <CardDescription>
                Enter return quantities up to the received quantity for each line item.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 text-center font-medium">Received Qty</th>
                    <th className="py-2 pr-4 text-center font-medium">Return Qty</th>
                    <th className="py-2 pr-4 text-right font-medium">Unit Cost</th>
                    <th className="py-2 pr-4 text-right font-medium">Debit Total</th>
                    <th className="py-2 font-medium">Item Return Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.items.map((item) => {
                    const lineState = lines[item.id]
                    const returnQty = lineState?.quantity ?? 0
                    const lineTotal = returnQty * item.unitCost
                    const isZeroReceived = item.receivedQuantity <= 0

                    return (
                      <tr
                        key={item.id}
                        className={`border-b ${isZeroReceived ? 'opacity-40' : ''}`}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">{item.productSku}</p>
                        </td>
                        <td className="py-3 pr-4 text-center font-semibold tabular-nums">
                          {item.receivedQuantity}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={item.receivedQuantity}
                            disabled={isZeroReceived || submitting}
                            value={returnQty === 0 ? '' : returnQty}
                            onChange={(e) =>
                              handleLineQtyChange(
                                item.id,
                                parseInt(e.target.value, 10) || 0,
                                item.receivedQuantity
                              )
                            }
                            placeholder="0"
                            className="mx-auto w-20 text-center"
                          />
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {formatCurrency(item.unitCost)}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="py-3">
                          <Input
                            placeholder="Reason for line return..."
                            disabled={isZeroReceived || returnQty === 0 || submitting}
                            value={lineState?.reason ?? ''}
                            onChange={(e) => handleLineReasonChange(item.id, e.target.value)}
                            className="h-9 text-xs"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Return Header Details */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Return Details</CardTitle>
                <CardDescription>Information sent to vendor on dispatch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="returnDate">Return Date *</Label>
                  <Input
                    id="returnDate"
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Overall Reason for Return *</Label>
                  <Input
                    id="reason"
                    placeholder="e.g. Expired stock delivered, broken seals, packaging defect"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    disabled={submitting}
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      'Near expiry delivered',
                      'Damaged packaging in transit',
                      'Wrong product batch received',
                      'Manufacturer recall',
                      'Excess stock returned',
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
                  <Label htmlFor="notes">Notes / Dispatch Instructions (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Courier details, vendor RMA number, or return instructions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    disabled={submitting}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Summary & Debit Memo</CardTitle>
                <CardDescription>
                  Financial adjustment applied to {selectedPurchase.supplier.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items to Return:</span>
                  <span className="font-medium">{totalReturnUnits} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier Outstanding Debit:</span>
                  <span className="font-bold tabular-nums text-destructive">
                    -{formatCurrency(totalReturnAmount)}
                  </span>
                </div>
                <div className="space-y-1 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Automatic Actions on Submit:</p>
                  <p>1. Deducts inventory quantity from active branch stock.</p>
                  <p>2. Reduces associated batch quantities.</p>
                  <p>3. Creates a DEBIT entry on the supplier ledger.</p>
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
                    ? 'Creating Vendor Return...'
                    : `Confirm Return (${formatCurrency(totalReturnAmount)})`}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </form>
      )}
    </div>
  )
}
