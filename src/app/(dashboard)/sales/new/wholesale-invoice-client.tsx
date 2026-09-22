'use client'

import { Loader2, Plus, Trash2, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/currency'

interface WholesaleCustomer {
  id: string
  name: string
  phone: string | null
  creditLimit: number
  outstandingBalance: number
  creditDays: number
}

interface BranchOption {
  id: string
  name: string
  code: string | null
}

interface PosProduct {
  id: string
  name: string
  sku: string
  barcode: string | null
  unitOfMeasure: string
  mrp: number
  gstRate: number
  availableQuantity: number
}

interface BatchRow {
  id: string
  batchNumber: string
  expiryDate: string
  availableQuantity: number
  status: string
}

interface CartLine {
  key: string
  product: PosProduct
  quantity: number
  discountPercent: number
  batch: BatchRow | null
}

function classifyExpiry(expiryIso: string): {
  label: string
  variant: 'info' | 'warning' | 'destructive' | 'success' | 'secondary'
  days: number
} {
  const expiry = new Date(expiryIso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)
  const ms = expiry.getTime() - today.getTime()
  const days = Math.ceil(ms / 86_400_000)
  if (days < 0) return { label: 'Expired', variant: 'destructive', days }
  if (days <= 30) return { label: `${days}d (critical)`, variant: 'destructive', days }
  if (days <= 60) return { label: `${days}d (warn)`, variant: 'warning', days }
  if (days <= 90) return { label: `${days}d (info)`, variant: 'info', days }
  return { label: `${days}d`, variant: 'success', days }
}

function lineTotal(line: CartLine): number {
  const base = line.product.mrp * line.quantity
  const disc = (base * line.discountPercent) / 100
  const taxable = base - disc
  const gst = taxable * (line.product.gstRate / 100)
  return taxable + gst
}

function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.product.mrp * l.quantity * (1 - l.discountPercent / 100), 0)
}

function cartGst(lines: CartLine[]): number {
  return cartSubtotal(lines) + 0 // placeholder so totals layout matches page
}

function cartTotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

export function WholesaleInvoiceClient({
  branches,
  wholesaleCustomers,
  defaultBranchId,
}: {
  branches: BranchOption[]
  wholesaleCustomers: WholesaleCustomer[]
  defaultBranchId: string
}) {
  const router = useRouter()
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [customerId, setCustomerId] = useState(wholesaleCustomers[0]?.id ?? '')
  const [lines, setLines] = useState<CartLine[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<PosProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT'>('CREDIT')
  const [amountPaid, setAmountPaid] = useState('0')
  const [notes, setNotes] = useState('')
  const [submitting, startSubmit] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [batchesByProduct, setBatchesByProduct] = useState<Record<string, BatchRow[]>>({})
  const [loadingBatchesFor, setLoadingBatchesFor] = useState<string | null>(null)

  const selectedCustomer = useMemo(
    () => wholesaleCustomers.find((c) => c.id === customerId),
    [customerId, wholesaleCustomers]
  )

  const total = useMemo(() => cartTotal(lines), [lines])
  const subtotal = useMemo(() => cartSubtotal(lines), [lines])
  const tax = useMemo(() => total - subtotal, [subtotal, total])

  function searchProducts() {
    if (!branchId || !productSearch.trim()) {
      setProductResults([])
      return
    }
    setSearching(true)
    const params = new URLSearchParams({
      search: productSearch,
      branchId,
      limit: '12',
    })
    fetch(`/api/pos/products?${params.toString()}`)
      .then(async (r) => {
        const j = (await r.json()) as { success?: boolean; data?: PosProduct[] }
        if (!r.ok || !j.success) {
          setError('Product search failed')
          setProductResults([])
          return
        }
        setProductResults(j.data ?? [])
      })
      .catch(() => setError('Product search failed'))
      .finally(() => setSearching(false))
  }

  function ensureBatchesLoaded(productId: string) {
    if (batchesByProduct[productId]) return
    if (!branchId) return
    setLoadingBatchesFor(productId)
    const params = new URLSearchParams({
      productId,
      branchId,
      limit: '50',
      sortBy: 'expiryDate',
      sortOrder: 'asc',
    })
    fetch(`/api/batches?${params.toString()}`)
      .then(async (r) => {
        const j = (await r.json()) as { success?: boolean; data?: { data?: BatchRow[] } }
        if (!r.ok || !j.success) {
          setBatchesByProduct((prev) => ({ ...prev, [productId]: [] }))
          return
        }
        const rows = (j.data?.data ?? []).map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          availableQuantity: b.availableQuantity,
          status: b.status,
        }))
        setBatchesByProduct((prev) => ({ ...prev, [productId]: rows }))
      })
      .catch(() => setBatchesByProduct((prev) => ({ ...prev, [productId]: [] })))
      .finally(() => setLoadingBatchesFor(null))
  }

  function addLine(product: PosProduct) {
    if (lines.some((l) => l.product.id === product.id)) {
      setLines((prev) =>
        prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
      )
      return
    }
    const newLine: CartLine = {
      key: `${product.id}-${Date.now()}`,
      product,
      quantity: 1,
      discountPercent: 0,
      batch: null,
    }
    setLines((prev) => [...prev, newLine])
    ensureBatchesLoaded(product.id)
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function selectBatch(key: string, batch: BatchRow) {
    // Server blocks expired + non-ACTIVE; client guard for UX clarity.
    const cls = classifyExpiry(batch.expiryDate)
    if (cls.days < 0) {
      setError(`Cannot select batch ${batch.batchNumber}: expired`)
      return
    }
    if (batch.status !== 'ACTIVE') {
      setError(`Cannot select batch ${batch.batchNumber}: status ${batch.status}`)
      return
    }
    if (batch.availableQuantity <= 0) {
      setError(`Cannot select batch ${batch.batchNumber}: no stock`)
      return
    }
    updateLine(key, { batch })
  }

  function submit() {
    setError(null)
    setSuccess(null)
    if (!branchId) return setError('Pick a branch')
    if (!customerId) return setError('Pick a wholesale customer')
    if (lines.length === 0) return setError('Add at least one item')
    for (const l of lines) {
      if (!l.batch) {
        setError(`Select a batch for ${l.product.name}`)
        return
      }
      if (l.batch.availableQuantity < l.quantity) {
        setError(
          `Batch ${l.batch.batchNumber} has only ${l.batch.availableQuantity} ${l.product.unitOfMeasure} available — reduce line qty`
        )
        return
      }
    }
    const paid = Number(amountPaid) || 0
    if (paymentMethod === 'CASH' && paid < total - 0.01) {
      setError(
        `Cash payment of ${formatCurrency(String(paid))} is below the invoice total ${formatCurrency(String(total))}`
      )
      return
    }

    startSubmit(async () => {
      const payments =
        paymentMethod === 'CREDIT'
          ? [{ method: 'CREDIT', amount: 0 }]
          : [{ method: 'CASH', amount: paid }]
      const payload = {
        branchId,
        customerId,
        payments,
        notes: notes || undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          batchId: l.batch!.id,
        })),
      }
      try {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j = (await res.json()) as
          | { success: true; data: { id: string; invoiceNumber: string } }
          | { success: false; error: { message: string } }
        if (!res.ok || !('data' in j)) {
          const msg = 'error' in j ? j.error.message : `Sale failed (${res.status})`
          setError(msg)
          return
        }
        setSuccess(
          `Invoice ${j.data.invoiceNumber} created (${paymentMethod === 'CREDIT' ? 'on credit' : 'paid in cash'})`
        )
        setLines([])
        setProductResults([])
        setAmountPaid('0')
        setTimeout(() => router.push(`/sales/${j.data.id}`), 600)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed')
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.code ? `(${b.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Customer (wholesale only)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick customer" />
                </SelectTrigger>
                <SelectContent>
                  {wholesaleCustomers.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No wholesale customers — create one first
                    </SelectItem>
                  )}
                  {wholesaleCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · outstanding {formatCurrency(String(c.outstandingBalance))} / limit{' '}
                      {formatCurrency(String(c.creditLimit))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedCustomer && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              {selectedCustomer.name} · outstanding{' '}
              <span className="font-semibold text-amber-700">
                {formatCurrency(String(selectedCustomer.outstandingBalance))}
              </span>{' '}
              of {formatCurrency(String(selectedCustomer.creditLimit))} limit ·{' '}
              {selectedCustomer.creditDays}-day credit terms
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Search product by name, SKU or barcode"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchProducts()
              }}
            />
            <Button type="button" variant="secondary" onClick={searchProducts} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {productResults.length > 0 && (
            <div className="rounded-md border">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addLine(p)}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      SKU {p.sku} · stock {p.availableQuantity} · {formatCurrency(String(p.mrp))}
                    </div>
                  </div>
                  <Plus className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}

          {lines.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No items yet — search and pick products above.
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => {
                const batches = batchesByProduct[line.product.id] ?? []
                const isLoadingBatches =
                  loadingBatchesFor === line.product.id && !batchesByProduct[line.product.id]
                return (
                  <div key={line.key} className="rounded-md border p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{line.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.product.sku} · {formatCurrency(String(line.product.mrp))} ·{' '}
                          {line.product.unitOfMeasure}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Disc %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          value={line.discountPercent}
                          onChange={(e) =>
                            updateLine(line.key, {
                              discountPercent: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                      <div className="text-right">
                        <Label className="text-xs">Line total</Label>
                        <div className="pt-2 font-semibold">
                          {formatCurrency(String(lineTotal(line)))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label className="text-xs">Batch (FEFO disabled — pick manually)</Label>
                      <Select
                        value={line.batch?.id ?? ''}
                        onValueChange={(batchId) => {
                          const b = batches.find((x) => x.id === batchId)
                          if (b) selectBatch(line.key, b)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingBatches ? 'Loading…' : 'Pick batch'} />
                        </SelectTrigger>
                        <SelectContent>
                          {batches.length === 0 && !isLoadingBatches && (
                            <SelectItem value="__empty" disabled>
                              No batches available at this branch
                            </SelectItem>
                          )}
                          {batches.map((b) => {
                            const cls = classifyExpiry(b.expiryDate)
                            const blocked =
                              cls.days < 0 || b.status !== 'ACTIVE' || b.availableQuantity <= 0
                            return (
                              <SelectItem
                                key={b.id}
                                value={b.id}
                                disabled={blocked}
                                className="text-xs"
                              >
                                <span className="inline-flex items-center gap-2">
                                  {b.batchNumber} · exp {cls.label} · stock {b.availableQuantity}
                                  {b.status !== 'ACTIVE' ? ` · ${b.status}` : ''}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      {line.batch && (
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          <Badge variant={classifyExpiry(line.batch.expiryDate).variant}>
                            expires in {classifyExpiry(line.batch.expiryDate).label}
                          </Badge>
                          <Badge variant="secondary">
                            available {line.batch.availableQuantity}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Totals &amp; Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(String(subtotal))} />
            <Row label="GST" value={formatCurrency(String(tax))} />
            <Row label="Total" value={formatCurrency(String(total))} bold />
          </div>
          <div>
            <Label>Payment</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => {
                setPaymentMethod(v as 'CASH' | 'CREDIT')
                if (v === 'CREDIT') setAmountPaid('0')
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash / UPI / etc.</SelectItem>
                <SelectItem value="CREDIT">On credit (outstanding)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentMethod === 'CASH' && (
            <div>
              <Label>Amount paid</Label>
              <Input
                type="number"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-300 bg-green-50 p-2 text-xs text-green-700">
              {success}
            </div>
          )}
          <Button
            type="button"
            className="w-full"
            onClick={submit}
            disabled={submitting || lines.length === 0}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create invoice
          </Button>
          <Link
            href="/customers/new"
            className="block text-center text-xs text-muted-foreground hover:underline"
          >
            Need a new wholesale customer? Create one →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? 'font-bold tabular-nums' : 'font-medium tabular-nums'}>{value}</span>
    </div>
  )
}

// Suppress unused warning on cartGst (retained for future split-out tax line items).
void cartGst
