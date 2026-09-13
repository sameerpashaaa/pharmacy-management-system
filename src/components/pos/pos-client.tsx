'use client'

// ─────────────────────────────────────────────────────────────
// POS — Billing Client
//
// Fast barcode/text product search → cart → payment dialog
// (all methods, credit + inline customer) → create sale →
// held-bill save/load/delete → printable receipt.
//
// The server is the sole authority on money: prices, GST and
// totals shown here are *previews* reconstructable from the
// product rows/config; every amount is recomputed server-side
// at sale time (see sales-service.ts).
// ─────────────────────────────────────────────────────────────
import {
  Calculator,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/lib/hooks/use-toast'
import { computeItemPricing, computeSaleTotals } from '@/lib/sales/pricing'
import type { PosSettings } from '@/lib/settings/settings-service'
import { formatCurrency } from '@/lib/utils/currency'

interface PosUser {
  id: string
  branchId: string | null
  permissions: string[]
}

interface PosBranch {
  id: string
  name: string
  code: string | null
}

interface PosProductRow {
  id: string
  name: string
  genericName: string | null
  sku: string
  barcode: string | null
  unitOfMeasure: string
  mrp: number
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  hsnCode: string | null
  drugSchedule: string
  isPrescriptionRequired: boolean
  isGstExempt: boolean
  additionalBarcodes: string[]
  availableQuantity: number
}

interface CartLine {
  productId: string
  sku: string
  barcode: string | null
  name: string
  unitOfMeasure: string
  mrp: number
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  hsnCode: string | null
  drugSchedule: string
  isPrescriptionRequired: boolean
  isGstExempt: boolean
  quantity: number
  discountPercent: number
  availableQuantity: number
}

interface PaymentEntry {
  method: string
  amount: number
  reference: string
}

interface HeldBillRow {
  id: string
  label: string | null
  branchId: string
  createdAt: string
  cartData: unknown
}

const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'CREDIT', 'WALLET'] as const

const CREDIT = 'CREDIT'

const RX_SCHEDULES = new Set(['H', 'X'])

interface PosClientProps {
  user: PosUser
  branches: PosBranch[]
  initialConfig: PosSettings
}

export function PosClient({ user, branches, initialConfig }: PosClientProps) {
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const [config] = useState<PosSettings>(initialConfig)
  const [branchId, setBranchId] = useState<string | null>(
    () => user.branchId ?? branches[0]?.id ?? null
  )

  // ─── Product search ─────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [products, setProducts] = useState<PosProductRow[]>([])
  const [searching, setSearching] = useState(false)

  // ─── Cart ──────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')

  // ─── Payment ───────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false)
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'CASH', amount: 0, reference: '' },
  ])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [prescriptionId, setPrescriptionId] = useState('')

  // ─── Held bills ────────────────────────────────────────────
  const [heldOpen, setHeldOpen] = useState(false)
  const [heldBills, setHeldBills] = useState<HeldBillRow[]>([])
  const [heldLabel, setHeldLabel] = useState('')

  // ─── Receipt ───────────────────────────────────────────────
  const [completedSale, setCompletedSale] = useState<
    | (Record<string, unknown> & {
        invoiceNumber: string
        items: {
          productName: string
          quantity: number
          unitPrice: string | number
          discountPercent: string | number
          totalAmount: string | number
        }[]
        payments: { method: string; amount: string | number }[]
        subtotal: string | number
        discountAmount: string | number
        taxAmount: string | number
        cgstAmount: string | number
        sgstAmount: string | number
        igstAmount: string | number
        totalAmount: string | number
        amountPaid: string | number
        balanceDue: string | number
        paymentStatus: string
        customer: { name: string } | null
        saleDate: string
      })
    | null
  >(null)
  const [charging, setCharging] = useState(false)

  // Permissions
  const canDiscount = user.permissions.includes('sales:discount')
  const canDiscountOverride = user.permissions.includes('sales:discount_override')
  const canCredit = user.permissions.includes('sales:credit')

  // ─── Product search (debounced) ─────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!branchId) {
      setProducts([])
      return
    }
    let cancelled = false
    setSearching(true)

    async function run() {
      try {
        const params = new URLSearchParams({ branchId: branchId as string, limit: '24' })
        if (debouncedSearch) params.set('search', debouncedSearch)
        const res = await fetch(`/api/pos/products?${params.toString()}`)
        const json = (await res.json()) as { success: boolean; data?: PosProductRow[] }
        if (!cancelled) setProducts(json.success ? (json.data ?? []) : [])
      } catch {
        if (!cancelled) setProducts([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [branchId, debouncedSearch])

  // ─── Pricing preview ───────────────────────────────────────
  const pricing = useMemo(() => {
    const lines = cart.map((line) =>
      computeItemPricing({
        quantity: line.quantity,
        mrp: line.mrp,
        gstRate: line.gstRate,
        cgstRate: line.cgstRate,
        sgstRate: line.sgstRate,
        igstRate: line.igstRate,
        isGstExempt: line.isGstExempt,
        discountPercent: line.discountPercent,
        taxInclusive: config.taxInclusive,
      })
    )
    const totals = computeSaleTotals(lines, {
      taxInclusive: config.taxInclusive,
      roundOffTotal: config.roundOffTotal,
    })
    return { lines, totals }
  }, [cart, config.roundOffTotal, config.taxInclusive])

  const received = useMemo(
    () => payments.reduce((s, p) => (p.method === CREDIT ? s : s + (p.amount || 0)), 0),
    [payments]
  )
  const balanceDue = Math.max(0, pricing.totals.totalAmount - received)

  // ─── Cart helpers ───────────────────────────────────────────
  const addToCart = useCallback((p: PosProductRow) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id)
      if (existing) {
        return prev.map((c) =>
          c.productId === p.id
            ? { ...c, quantity: Math.min(c.quantity + 1, Math.max(p.availableQuantity, 1)) }
            : c
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          unitOfMeasure: p.unitOfMeasure,
          mrp: p.mrp,
          gstRate: p.gstRate,
          cgstRate: p.cgstRate,
          sgstRate: p.sgstRate,
          igstRate: p.igstRate,
          hsnCode: p.hsnCode,
          drugSchedule: p.drugSchedule,
          isPrescriptionRequired: p.isPrescriptionRequired,
          isGstExempt: p.isGstExempt,
          quantity: 1,
          discountPercent: 0,
          availableQuantity: p.availableQuantity,
        },
      ]
    })
  }, [])

  const setQty = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? {
              ...c,
              quantity: Math.max(1, Math.min(quantity || 1, Math.max(c.availableQuantity, 1))),
            }
          : c
      )
    )
  }, [])

  const setDiscount = useCallback((productId: string, discountPercent: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? { ...c, discountPercent: Math.max(0, Math.min(discountPercent || 0, 100)) }
          : c
      )
    )
  }, [])

  const removeLine = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setNotes('')
    setPayments([{ method: 'CASH', amount: 0, reference: '' }])
    setCustomerName('')
    setCustomerPhone('')
    setPrescriptionId('')
  }, [])

  // ─── Discount gate ─────────────────────────────────────────
  const discountGate = useMemo(() => {
    const over = cart.find((c) => c.discountPercent > config.maxDiscountPercent)
    if (!over) return { blocked: false, reason: '' }
    if (canDiscountOverride) return { blocked: false, reason: '' }
    return {
      blocked: true,
      reason: `${over.name}: discount ${over.discountPercent}% exceeds the ${config.maxDiscountPercent}% limit`,
    }
  }, [cart, config.maxDiscountPercent, canDiscountOverride])

  const needsPrescription = useMemo(
    () => cart.some((c) => c.isPrescriptionRequired || RX_SCHEDULES.has(c.drugSchedule)),
    [cart]
  )

  const needsCreditCustomer = useMemo(
    () =>
      payments.some((p) => p.method === CREDIT) &&
      config.requireCustomerForCredit &&
      !customerName.trim(),
    [payments, config.requireCustomerForCredit, customerName]
  )

  // ─── Charge / payment dialog controls ──────────────────────
  const openPayment = useCallback(() => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    if (!branchId) {
      toast.error('A branch is required to bill')
      return
    }
    setPayments([{ method: 'CASH', amount: pricing.totals.totalAmount, reference: '' }])
    setCustomerName('')
    setCustomerPhone('')
    setPrescriptionId('')
    setPayOpen(true)
  }, [cart.length, branchId, pricing.totals.totalAmount, toast])

  const updatePayment = useCallback((i: number, patch: Partial<PaymentEntry>) => {
    setPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }, [])

  const addPaymentLine = useCallback(() => {
    setPayments((prev) => [...prev, { method: 'CASH', amount: 0, reference: '' }])
  }, [])

  const removePaymentLine = useCallback((i: number) => {
    setPayments((prev) => prev.filter((_, idx) => idx !== i))
  }, [])

  const quickCash = useCallback(() => {
    setPayments((prev) => {
      const remaining = balanceDue
      const real = prev.filter((p) => p.method !== CREDIT)
      const credit = prev.filter((p) => p.method === CREDIT)
      return [
        ...real.map((p) => ({ ...p, amount: 0 })),
        { method: 'CASH', amount: Math.ceil(remaining), reference: '' },
        ...credit,
      ]
    })
  }, [balanceDue])

  // ─── Create sale ───────────────────────────────────────────
  const submitSale = useCallback(async () => {
    if (!branchId) return
    if (cart.length === 0) return

    if (discountGate.blocked) {
      toast.error('Discount limit exceeded', discountGate.reason)
      return
    }
    if (needsPrescription && !prescriptionId.trim()) {
      toast.error(
        'Prescription required',
        'This bill contains schedule-H/X or prescription-only items'
      )
      setPayOpen(true)
      return
    }
    const usingCredit = payments.some((p) => p.method === CREDIT)
    if (usingCredit && needsCreditCustomer) {
      toast.error('Customer required for credit sales')
      return
    }
    if (!usingCredit && customerName.trim()) {
      toast.error('Customer capture is only supported for credit sales')
      return
    }
    const realPayments = payments.filter((p) => p.method !== CREDIT)
    const hasRealMoney = realPayments.some((p) => (p.amount || 0) > 0)
    if (!usingCredit && !hasRealMoney) {
      toast.error('Enter a payment amount')
      return
    }

    setCharging(true)
    try {
      const body = {
        branchId,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          discountPercent: c.discountPercent,
        })),
        payments: payments
          .filter((p) => (p.amount || 0) > 0)
          .map((p) => ({
            method: p.method,
            amount: p.amount,
            ...(p.reference ? { reference: p.reference } : {}),
          })),
        ...(usingCredit && customerName
          ? { customer: { name: customerName, ...(customerPhone ? { phone: customerPhone } : {}) } }
          : {}),
        ...(prescriptionId.trim() ? { prescriptionId: prescriptionId.trim() } : {}),
        ...(notes ? { notes } : {}),
      }

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: Record<string, unknown>
        error?: { message?: string }
      }

      if (!json.success || !json.data) {
        toast.error('Could not complete the sale', json.error?.message)
        return
      }

      setCompletedSale(json.data as never)
      setPayOpen(false)
      clearCart()
      toast.success(`Invoice ${String(json.data.invoiceNumber ?? '')} created`)
      if (config.autoPrintInvoice) {
        setTimeout(() => window.print(), 400)
      }
    } catch {
      toast.error('Could not complete the sale')
    } finally {
      setCharging(false)
    }
  }, [
    branchId,
    cart,
    config.autoPrintInvoice,
    discountGate,
    needsCreditCustomer,
    needsPrescription,
    notes,
    payments,
    prescriptionId,
    customerName,
    customerPhone,
    clearCart,
    toast,
  ])

  // ─── Held bills ────────────────────────────────────────────
  const loadHeldBills = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/held-bills')
      const json = (await res.json()) as { success: boolean; data?: HeldBillRow[] }
      setHeldBills(json.success ? (json.data ?? []) : [])
    } catch {
      setHeldBills([])
    }
  }, [])

  const saveHeldBill = useCallback(async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    try {
      const res = await fetch('/api/pos/held-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(heldLabel.trim() ? { label: heldLabel.trim() } : {}),
          cartData: cart,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message?: string } }
      if (!json.success) {
        toast.error('Could not save held bill', json.error?.message)
        return
      }
      toast.success('Bill held for later')
      setHeldLabel('')
      await loadHeldBills()
    } catch {
      toast.error('Could not save held bill')
    }
  }, [cart, heldLabel, loadHeldBills, toast])

  const loadHeldBill = useCallback(
    async (id: string) => {
      const bill = heldBills.find((b) => b.id === id)
      if (!bill) return
      const data = bill.cartData as { items?: CartLine[] } | Array<CartLine> | null
      let items: CartLine[] = []
      if (Array.isArray(data)) items = data
      else if (data?.items) items = data.items
      if (items.length === 0) {
        toast.error('Held bill is empty')
        return
      }
      setCart(items)
      setHeldOpen(false)
      toast.success('Held bill loaded')
    },
    [heldBills, toast]
  )

  const deleteHeldBill = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/pos/held-bills/${id}`, { method: 'DELETE' })
        const json = (await res.json()) as { success: boolean }
        if (!json.success) {
          toast.error('Could not delete held bill')
          return
        }
        setHeldBills((prev) => prev.filter((b) => b.id !== id))
        toast.success('Held bill deleted')
      } catch {
        toast.error('Could not delete held bill')
      }
    },
    [toast]
  )

  useEffect(() => {
    if (heldOpen) void loadHeldBills()
  }, [heldOpen, loadHeldBills])

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ─── Left: search + catalog ─────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col border-b lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative flex-1 basis-52">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && products.length > 0) {
                  addToCart(products[0])
                  setSearch('')
                }
              }}
              placeholder="Search name, SKU or scan barcode…"
              className="pl-8"
              autoFocus
            />
          </div>
          {user.branchId === null && (
            <Select value={branchId ?? undefined} onValueChange={(v) => setBranchId(v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
            Held Bills
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {searching && products.length === 0 && (
            <div className="col-span-full flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!searching && products.length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center text-muted-foreground">
              {debouncedSearch
                ? 'No products match your search'
                : 'Start typing to search products'}
            </div>
          )}
          {products.map((p) => {
            const out = p.availableQuantity <= 0
            return (
              <button
                key={p.id}
                type="button"
                disabled={out}
                onClick={() => addToCart(p)}
                className="group flex flex-col justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div>
                  <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {p.unitOfMeasure}
                    </Badge>
                    {(p.isPrescriptionRequired || RX_SCHEDULES.has(p.drugSchedule)) && (
                      <Badge variant="destructive" className="text-[10px]">
                        RX
                      </Badge>
                    )}
                    {out && (
                      <Badge variant="secondary" className="text-[10px]">
                        Out of stock
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{formatCurrency(p.mrp)}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.availableQuantity} in stock
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Right: cart + totals ───────────────────────────── */}
      <div className="flex w-full flex-col border-t lg:w-[380px] lg:border-t-0">
        <div className="flex items-center gap-2 border-b p-3">
          <ShoppingCart className="h-5 w-5" />
          <h2 className="text-lg font-bold">Bill</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHeldLabel('')
                void saveHeldBill()
              }}
            >
              Hold
            </Button>
            <Button variant="ghost" size="sm" onClick={clearCart} disabled={cart.length === 0}>
              <RotateCcw className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {cart.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-40" />
              <p className="text-sm">Cart is empty — tap a product to add it</p>
            </div>
          )}
          {cart.map((c) => {
            const over = c.discountPercent > config.maxDiscountPercent && !canDiscountOverride
            return (
              <div key={c.productId} className="mb-3 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.sku} · {formatCurrency(c.mrp)}/{c.unitOfMeasure}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => removeLine(c.productId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(c.productId, c.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">{c.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(c.productId, c.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={c.discountPercent}
                      onChange={(e) => setDiscount(c.productId, Number(e.target.value))}
                      className="h-8 w-16 text-right tabular-nums"
                      disabled={!canDiscount}
                      aria-label={`Discount % for ${c.name}`}
                    />
                    <span className="text-xs text-muted-foreground">% off</span>
                  </div>
                </div>
                {over && (
                  <p className="mt-1 text-xs text-amber-600">
                    Above {config.maxDiscountPercent}% — requires discount override
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t p-3">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(pricing.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">−{formatCurrency(pricing.totals.discountAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GST</dt>
              <dd className="tabular-nums">{formatCurrency(pricing.totals.taxAmount)}</dd>
            </div>
            {config.roundOffTotal && pricing.totals.roundOffDifference !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Round-off</dt>
                <dd className="tabular-nums">
                  {formatCurrency(pricing.totals.roundOffDifference)}
                </dd>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(pricing.totals.totalAmount)}</dd>
            </div>
          </dl>

          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="mt-3 h-9"
          />

          <Button
            className="mt-3 w-full"
            size="lg"
            onClick={openPayment}
            disabled={cart.length === 0}
          >
            <Calculator className="h-4 w-4" />
            Charge {formatCurrency(pricing.totals.totalAmount)}
          </Button>
        </div>
      </div>

      {/* ─── Payment dialog ─────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take Payment</DialogTitle>
            <DialogDescription>
              Total due is{' '}
              <span className="font-semibold">{formatCurrency(pricing.totals.totalAmount)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Select value={p.method} onValueChange={(v) => updatePayment(i, { method: v })}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.filter((m) => m !== CREDIT || canCredit).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.amount || ''}
                    onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
                    placeholder="Amount"
                    className="flex-1 text-right tabular-nums"
                  />
                  {payments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => removePaymentLine(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input
                  value={p.reference}
                  onChange={(e) => updatePayment(i, { reference: e.target.value })}
                  placeholder={
                    p.method === 'CASH'
                      ? 'Change given (optional)'
                      : p.method === 'UPI'
                        ? 'UPI reference (optional)'
                        : 'Reference (optional)'
                  }
                  className="h-9"
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={addPaymentLine}>
                + Add payment
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPayments([
                    { method: 'CASH', amount: pricing.totals.totalAmount, reference: '' },
                  ])
                }
              >
                Exact cash
              </Button>
              <Button variant="outline" size="sm" onClick={quickCash}>
                Quick cash
              </Button>
            </div>

            {payments.some((p) => p.method === CREDIT) && config.requireCustomerForCredit && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Badge variant="warning">Credit sale — customer required</Badge>
                </div>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name *"
                />
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone (optional)"
                />
              </div>
            )}

            {needsPrescription && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  This bill contains prescription-only items — prescription ID is required.
                </p>
                <Input
                  value={prescriptionId}
                  onChange={(e) => setPrescriptionId(e.target.value)}
                  placeholder="Prescription ID"
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Received</span>
              <span className="font-semibold tabular-nums">{formatCurrency(received)}</span>
              <span className="text-muted-foreground">Balance</span>
              <span className="font-semibold tabular-nums">{formatCurrency(balanceDue)}</span>
            </div>

            {payments.some((p) => p.method === CREDIT) && (
              <p className="text-xs text-muted-foreground">
                Credit payment records the outstanding balance as a customer credit; only the
                non-credit total counts as cash received.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSale} disabled={charging || cart.length === 0}>
              {charging && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Held bills dialog ──────────────────────────────── */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Held Bills</DialogTitle>
            <DialogDescription>
              Save the current cart to bill later, or load an existing held bill.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={heldLabel}
              onChange={(e) => setHeldLabel(e.target.value)}
              placeholder="Label (optional)"
            />
            <Button variant="outline" onClick={saveHeldBill} disabled={cart.length === 0}>
              Save current
            </Button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {heldBills.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No held bills yet</p>
            )}
            {heldBills.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg border p-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => loadHeldBill(b.id)}
                >
                  <div className="truncate text-sm font-medium">{b.label || 'Unlabelled bill'}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => deleteHeldBill(b.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Receipt dialog ─────────────────────────────────── */}
      <Dialog open={completedSale !== null} onOpenChange={(v) => !v && setCompletedSale(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Sale Complete
            </DialogTitle>
            <DialogDescription>
              Invoice {completedSale ? String(completedSale.invoiceNumber ?? '') : ''}
            </DialogDescription>
          </DialogHeader>

          {completedSale && (
            <div className="rounded-lg border p-4">
              <div className="mb-3 text-center">
                <div className="text-sm text-muted-foreground">PharmaCare</div>
                <div className="text-sm font-semibold">
                  {String(completedSale.invoiceNumber ?? '')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(String(completedSale.saleDate ?? '')).toLocaleString()}
                  {completedSale.customer ? ` · ${completedSale.customer.name}` : ''}
                </div>
              </div>
              <div className="space-y-1 border-t border-dashed pt-2 text-sm">
                {completedSale.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">
                      {it.productName} × {it.quantity}
                    </span>
                    <span className="tabular-nums">{formatCurrency(it.totalAmount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-dashed pt-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(completedSale.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    −{formatCurrency(completedSale.discountAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GST</span>
                  <span className="tabular-nums">{formatCurrency(completedSale.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(completedSale.totalAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed pt-1">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatCurrency(completedSale.amountPaid)}</span>
                </div>
                {Number(completedSale.balanceDue) > 0 && (
                  <div className="flex justify-between font-medium">
                    <span>Balance due</span>
                    <span className="tabular-nums">{formatCurrency(completedSale.balanceDue)}</span>
                  </div>
                )}
                {completedSale.payments?.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {completedSale.payments
                      .map((p) => `${p.method} ${formatCurrency(p.amount)}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletedSale(null)}>
              New Sale
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
