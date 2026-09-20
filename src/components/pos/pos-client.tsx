'use client'

// ─────────────────────────────────────────────────────────────
// POS — Professional Pharmacy Billing & Terminal Client
//
// Structured Medicine Grid → Fast Barcode & Text Search →
// Cart & Stock Limits → Payment Processing → Held Bills → Receipt
// ─────────────────────────────────────────────────────────────
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Calculator,
  Check,
  CheckCircle2,
  Droplet,
  FlaskConical,
  Loader2,
  Minus,
  Package,
  Pill,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Syringe,
  Trash2,
  X,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
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
import { cn } from '@/lib/utils/cn'
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

export interface PosProductRow {
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
  tabsPerStrip?: number | null
  rackCode?: string | null
  categoryName?: string | null
  manufacturer?: string | null
  composition?: string | null
  packSize?: string | null
  imageUrl?: string | null
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
  looseUnits: number
  tabsPerStrip?: number | null
  discountPercent: number
  availableQuantity: number
  categoryName?: string | null
  composition?: string | null
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

const RX_SCHEDULES = new Set(['H', 'H1', 'X'])

interface PosClientProps {
  user: PosUser
  branches: PosBranch[]
  initialConfig: PosSettings
}

// Icon selector helper based on dosage form / unit / category
function getMedicineIcon(unitOfMeasure: string, categoryName?: string | null) {
  const u = (unitOfMeasure || '').toLowerCase()
  const c = (categoryName || '').toLowerCase()

  if (u.includes('syrup') || u.includes('bottle') || u.includes('liquid') || c.includes('syrup')) {
    return FlaskConical
  }
  if (u.includes('inj') || u.includes('vial') || c.includes('injection')) {
    return Syringe
  }
  if (u.includes('drop') || c.includes('drop')) {
    return Droplet
  }
  if (
    u.includes('cream') ||
    u.includes('ointment') ||
    u.includes('gel') ||
    c.includes('ointment')
  ) {
    return Sparkles
  }
  if (
    u.includes('strip') ||
    u.includes('tab') ||
    u.includes('cap') ||
    c.includes('tablet') ||
    c.includes('capsule')
  ) {
    return Pill
  }
  return Package
}

export function PosClient({ user, branches, initialConfig }: PosClientProps) {
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const isPosRoute = pathname === '/pos' || pathname === '/pos/'

  const [config] = useState<PosSettings>(initialConfig)
  const [branchId, setBranchId] = useState<string | null>(
    () => user.branchId ?? branches[0]?.id ?? null
  )

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(user.branchId ?? branches[0].id)
    }
  }, [branchId, branches, user.branchId])

  // ─── Product search & category filters ─────────────────────
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [products, setProducts] = useState<PosProductRow[]>([])
  const [searching, setSearching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('ALL')

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
  const [approvedPrescriptions, setApprovedPrescriptions] = useState<
    { id: string; prescriptionNumber: string | null; patientName: string }[]
  >([])

  const [h1PatientName, setH1PatientName] = useState('')
  const [h1PatientAddress, setH1PatientAddress] = useState('')
  const [h1PatientPhone, setH1PatientPhone] = useState('')
  const [h1DoctorName, setH1DoctorName] = useState('')
  const [h1DoctorRegNo, setH1DoctorRegNo] = useState('')
  const [h1ModalOpen, setH1ModalOpen] = useState(false)

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

  // ─── Auto-focus search input when opening POS ──────────────
  useEffect(() => {
    if (isPosRoute) {
      const timer = setTimeout(() => {
        searchRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isPosRoute])

  // ─── Debounce search query ─────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  // ─── Fetch products from server ────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!branchId) {
      setProducts([])
      return
    }
    setSearching(true)
    setFetchError(null)

    try {
      const params = new URLSearchParams({
        branchId: branchId,
        limit: '50',
      })
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }
      const res = await fetch(`/api/pos/products?${params.toString()}`)
      const json = (await res.json()) as {
        success: boolean
        data?: PosProductRow[]
        error?: { message?: string }
      }

      if (json.success && Array.isArray(json.data)) {
        // Sort deterministically by name ascending (case-insensitive)
        const sorted = [...json.data].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        )
        setProducts(sorted)
      } else {
        setFetchError(json.error?.message || 'Failed to load medicines')
      }
    } catch {
      setFetchError('Network error connecting to medicine database')
    } finally {
      setSearching(false)
    }
  }, [branchId, debouncedSearch])

  useEffect(() => {
    void fetchProducts()
  }, [fetchProducts])

  // ─── Client-side instant filtering & alphabetical sort ──────
  const displayedProducts = useMemo(() => {
    let list = products

    // Filter by active category / stock tab
    if (activeFilter === 'IN_STOCK') {
      list = list.filter((p) => p.availableQuantity > 0)
    } else if (activeFilter === 'RX') {
      list = list.filter((p) => p.isPrescriptionRequired || RX_SCHEDULES.has(p.drugSchedule))
    } else if (activeFilter === 'TABLETS') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('tab') ||
          p.unitOfMeasure.toLowerCase().includes('strip') ||
          p.categoryName?.toLowerCase().includes('tablet')
      )
    } else if (activeFilter === 'SYRUPS') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('syrup') ||
          p.unitOfMeasure.toLowerCase().includes('bottle') ||
          p.categoryName?.toLowerCase().includes('syrup')
      )
    } else if (activeFilter === 'CAPSULES') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('cap') ||
          p.categoryName?.toLowerCase().includes('capsule')
      )
    } else if (activeFilter === 'INJECTIONS') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('inj') ||
          p.categoryName?.toLowerCase().includes('injection')
      )
    } else if (activeFilter === 'OINTMENTS') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('ointment') ||
          p.unitOfMeasure.toLowerCase().includes('cream') ||
          p.categoryName?.toLowerCase().includes('ointment')
      )
    } else if (activeFilter === 'DROPS') {
      list = list.filter(
        (p) =>
          p.unitOfMeasure.toLowerCase().includes('drop') ||
          p.categoryName?.toLowerCase().includes('drop')
      )
    }

    // Client-side quick filter on current search term
    const cleanSearch = search.trim().toLowerCase()
    if (cleanSearch) {
      list = list.filter((p) => {
        const matchName = p.name.toLowerCase().includes(cleanSearch)
        const matchGeneric = p.genericName?.toLowerCase().includes(cleanSearch)
        const matchSku = p.sku.toLowerCase().includes(cleanSearch)
        const matchBarcode = p.barcode?.toLowerCase().includes(cleanSearch)
        const matchCat = p.categoryName?.toLowerCase().includes(cleanSearch)
        const matchComp = p.composition?.toLowerCase().includes(cleanSearch)
        const matchExtraBarcodes = p.additionalBarcodes.some((b) =>
          b.toLowerCase().includes(cleanSearch)
        )
        return (
          matchName ||
          matchGeneric ||
          matchSku ||
          matchBarcode ||
          matchCat ||
          matchComp ||
          matchExtraBarcodes
        )
      })
    }

    // Always keep alphabetical order A-Z
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }, [products, activeFilter, search])

  // Map of product in-cart quantities for quick badge display
  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of cart) {
      map.set(item.productId, item.quantity + item.looseUnits)
    }
    return map
  }, [cart])

  // ─── Pricing preview ───────────────────────────────────────
  const pricing = useMemo(() => {
    const lines = cart.map((line) =>
      computeItemPricing({
        quantity: line.quantity + line.looseUnits / (line.tabsPerStrip ?? 1),
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

  // ─── Cart helpers with stock limits ─────────────────────────
  const addToCart = useCallback(
    (p: PosProductRow) => {
      if (p.availableQuantity <= 0) {
        toast.error(`${p.name} is out of stock`, 'Cannot add to cart')
        return
      }

      setCart((prev) => {
        const existing = prev.find((c) => c.productId === p.id)
        if (existing) {
          const tabsPerStrip = existing.tabsPerStrip ?? 1
          const existingBaseQty = existing.quantity * tabsPerStrip + existing.looseUnits
          if (existingBaseQty + tabsPerStrip > p.availableQuantity) {
            toast.warning(
              'Stock limit reached',
              `Only ${p.availableQuantity} units of ${p.name} available in stock`
            )
            return prev
          }
          return prev.map((c) => (c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c))
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
            looseUnits: 0,
            tabsPerStrip: p.tabsPerStrip ?? null,
            discountPercent: 0,
            availableQuantity: p.availableQuantity,
            categoryName: p.categoryName,
            composition: p.composition,
          },
        ]
      })
    },
    [toast]
  )

  const setQty = useCallback(
    (productId: string, requestedQuantity: number) => {
      setCart((prev) =>
        prev.map((c) => {
          if (c.productId !== productId) return c
          const tabsPerStrip = c.tabsPerStrip ?? 1
          const requestedBaseQty = requestedQuantity * tabsPerStrip + c.looseUnits

          if (requestedBaseQty > c.availableQuantity) {
            toast.warning(
              'Stock limit exceeded',
              `Maximum available stock for ${c.name} is ${c.availableQuantity}`
            )
            return {
              ...c,
              quantity: Math.max(1, Math.floor(c.availableQuantity / tabsPerStrip)),
              looseUnits: c.availableQuantity % tabsPerStrip,
            }
          }

          return {
            ...c,
            quantity: Math.max(1, requestedQuantity || 1),
          }
        })
      )
    },
    [toast]
  )

  const setLooseUnits = useCallback(
    (productId: string, requestedLooseUnits: number) => {
      setCart((prev) =>
        prev.map((c) => {
          if (c.productId !== productId) return c
          const tabsPerStrip = c.tabsPerStrip ?? 1
          const looseUnits = Math.max(0, Math.min(requestedLooseUnits || 0, tabsPerStrip - 1))
          const totalBaseQty = c.quantity * tabsPerStrip + looseUnits
          if (totalBaseQty > c.availableQuantity) {
            toast.warning(
              'Stock limit exceeded',
              `Maximum available stock for ${c.name} is ${c.availableQuantity}`
            )
            return c
          }
          return { ...c, looseUnits }
        })
      )
    },
    [toast]
  )

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
    setH1PatientName('')
    setH1PatientAddress('')
    setH1PatientPhone('')
    setH1DoctorName('')
    setH1DoctorRegNo('')
  }, [])

  // ─── Barcode & Enter key handling ───────────────────────────
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearch('')
      return
    }

    if (e.key === 'Enter') {
      const term = search.trim().toLowerCase()
      if (!term) return

      // 1. Look for exact barcode match
      const exactBarcode = products.find(
        (p) =>
          p.barcode?.toLowerCase() === term ||
          p.additionalBarcodes.some((b) => b.toLowerCase() === term)
      )
      if (exactBarcode) {
        addToCart(exactBarcode)
        setSearch('')
        return
      }

      // 2. Look for exact SKU match
      const exactSku = products.find((p) => p.sku.toLowerCase() === term)
      if (exactSku) {
        addToCart(exactSku)
        setSearch('')
        return
      }

      // 3. If there is a filtered list and user presses enter, add the first available match
      if (displayedProducts.length > 0) {
        const topAvailable = displayedProducts.find((p) => p.availableQuantity > 0)
        if (topAvailable) {
          addToCart(topAvailable)
          setSearch('')
        }
      }
    }
  }

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

  const needsH1Capture = useMemo(
    () => cart.some((c) => c.drugSchedule === 'H1' || c.drugSchedule === 'NARCOTIC_NDPS'),
    [cart]
  )

  useEffect(() => {
    if (payOpen && needsPrescription && branchId) {
      fetch(`/api/prescriptions?status=APPROVED&limit=10&branchId=${branchId}`)
        .then(
          (res) =>
            res.json() as Promise<{
              success: boolean
              data?: {
                id: string
                prescriptionNumber: string | null
                patientName: string
              }[]
            }>
        )
        .then((json) => {
          if (json.success && Array.isArray(json.data)) {
            setApprovedPrescriptions(
              json.data.map((rx) => ({
                id: rx.id,
                prescriptionNumber: rx.prescriptionNumber,
                patientName: rx.patientName,
              }))
            )
          }
        })
        .catch(() => {})
    }
  }, [payOpen, needsPrescription, branchId])

  const needsCreditCustomer = useMemo(
    () =>
      payments.some((p) => p.method === CREDIT) &&
      config.requireCustomerForCredit &&
      !customerName.trim(),
    [payments, config.requireCustomerForCredit, customerName]
  )

  // ─── Charge / payment dialog controls ──────────────────────
  const openPayment = useCallback(
    (preferredMethod?: string) => {
      const method = typeof preferredMethod === 'string' ? preferredMethod : 'CASH'
      if (cart.length === 0) {
        toast.error('Cart is empty')
        return
      }
      if (!branchId) {
        toast.error('A branch is required to bill')
        return
      }
      if (needsH1Capture && (!h1PatientName || !h1DoctorName || !h1DoctorRegNo)) {
        setH1ModalOpen(true)
        return
      }
      setPayments([{ method, amount: pricing.totals.totalAmount, reference: '' }])
      setCustomerName('')
      setCustomerPhone('')
      setPrescriptionId('')
      setPayOpen(true)
    },
    [
      cart.length,
      branchId,
      pricing.totals.totalAmount,
      toast,
      needsH1Capture,
      h1PatientName,
      h1DoctorName,
      h1DoctorRegNo,
    ]
  )

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
          looseUnits: c.looseUnits,
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
        ...(needsH1Capture
          ? {
              h1Capture: {
                patientName: h1PatientName,
                patientAddress: h1PatientAddress,
                patientPhone: h1PatientPhone,
                doctorName: h1DoctorName,
                doctorRegNo: h1DoctorRegNo,
              },
            }
          : {}),
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
      // Refresh products stock in background
      void fetchProducts()
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
    fetchProducts,
    toast,
    needsH1Capture,
    h1PatientName,
    h1PatientAddress,
    h1PatientPhone,
    h1DoctorName,
    h1DoctorRegNo,
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
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      const tagName = active?.tagName.toLowerCase()
      const isTyping =
        tagName === 'input' ||
        tagName === 'textarea' ||
        (active instanceof HTMLElement && active.isContentEditable)

      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (isTyping || event.altKey || event.metaKey || event.shiftKey) return

      if (event.key === 'F9') {
        event.preventDefault()
        quickCash()
        openPayment('CASH')
      } else if (event.key === 'F10') {
        event.preventDefault()
        openPayment('UPI')
      } else if (event.key === 'F11') {
        event.preventDefault()
        void saveHeldBill()
      } else if (event.key === 'F12') {
        event.preventDefault()
        openPayment()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPayment, quickCash, saveHeldBill])

  useEffect(() => {
    if (heldOpen) void loadHeldBills()
  }, [heldOpen, loadHeldBills])

  // ─── Minimized POS Widget (when navigating away) ────────────
  if (!isPosRoute) {
    const hasOngoingTransaction =
      cart.length > 0 || payments.length > 1 || (payments[0] && payments[0].amount > 0)

    if (!hasOngoingTransaction) return null

    return (
      <button
        className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-4 rounded-full border border-primary/20 bg-card p-2 pr-4 shadow-xl transition-all hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        onClick={() => router.push('/pos')}
        aria-label="Expand Point of Sale"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <ShoppingCart className="h-6 w-6" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sm font-bold leading-tight">
            {cart.length} {cart.length === 1 ? 'item' : 'items'} in bill
          </span>
          <span className="text-xs font-semibold text-primary">
            {formatCurrency(pricing.totals.totalAmount)}
          </span>
        </div>
        <div className="ml-2 flex items-center justify-center rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
          Restore POS ↑
        </div>
      </button>
    )
  }

  // ─── Category & Filter Tabs ─────────────────────────────────
  const FILTER_TABS = [
    { id: 'ALL', label: 'All Medicines', count: products.length },
    {
      id: 'IN_STOCK',
      label: 'In Stock',
      count: products.filter((p) => p.availableQuantity > 0).length,
    },
    { id: 'TABLETS', label: 'Tablets' },
    { id: 'SYRUPS', label: 'Syrups' },
    { id: 'CAPSULES', label: 'Capsules' },
    { id: 'INJECTIONS', label: 'Injections' },
    { id: 'DROPS', label: 'Drops' },
    { id: 'OINTMENTS', label: 'Ointments' },
    {
      id: 'RX',
      label: 'Rx Only',
      count: products.filter((p) => p.isPrescriptionRequired || RX_SCHEDULES.has(p.drugSchedule))
        .length,
    },
  ]

  // ─── Full POS Interface ─────────────────────────────────────
  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-background lg:flex-row">
      {/* ─── Center / Left: Search & Medicine Grid ──────────── */}
      <div className="flex min-h-0 flex-1 flex-col border-b lg:border-b-0 lg:border-r">
        {/* Top Header & Search Bar */}
        <div className="flex flex-col gap-2.5 border-b bg-card/60 p-3.5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search name, SKU, generic formula or scan barcode…"
                className="h-10 border-border/80 bg-background pl-9 pr-9 text-sm font-normal text-foreground shadow-inner placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    searchRef.current?.focus()
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Branch Selector */}
            {user.branchId === null && branches.length > 1 && (
              <Select value={branchId ?? undefined} onValueChange={(v) => setBranchId(v)}>
                <SelectTrigger className="h-10 w-44 text-xs font-medium">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Held Bills Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 px-3 text-xs font-medium"
              onClick={() => setHeldOpen(true)}
            >
              <Barcode className="h-4 w-4 text-muted-foreground" />
              Held Bills
              {heldBills.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {heldBills.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Quick Category / Status Filter Chips */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
            {FILTER_TABS.map((tab) => {
              const active = activeFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={cn(
                        'py-0.2 rounded-full px-1.5 text-[10px]',
                        active
                          ? 'bg-primary-foreground/20 font-bold text-primary-foreground'
                          : 'bg-background/80 text-muted-foreground'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results Bar */}
        <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium">
            <span>
              Showing <strong className="text-foreground">{displayedProducts.length}</strong>{' '}
              medicines (A-Z)
            </span>
            {search.trim() && (
              <Badge variant="outline" className="text-[10px] font-normal">
                filtered by &ldquo;{search.trim()}&rdquo;
              </Badge>
            )}
          </div>
          <div className="hidden items-center gap-3 text-[11px] sm:flex">
            <span>
              💡 Press{' '}
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{' '}
              to add top match
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd>{' '}
              to clear
            </span>
          </div>
        </div>

        {/* ─── Structured Medicine Product Grid ──────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Loading Skeleton State */}
          {searching && products.length === 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex min-h-[155px] animate-pulse flex-col justify-between rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-12 rounded bg-muted" />
                      <div className="h-4 w-8 rounded bg-muted" />
                    </div>
                    <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div className="h-4 w-12 rounded bg-muted" />
                    <div className="h-4 w-14 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Database/Network Error State */}
          {!searching && fetchError && (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold">{fetchError}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Please verify database connectivity or select another branch.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchProducts()}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry loading
              </Button>
            </div>
          )}

          {/* Empty Search / Filter State */}
          {!searching && !fetchError && displayedProducts.length === 0 && (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search className="h-7 w-7 opacity-60" />
              </div>
              <div className="max-w-sm">
                <h3 className="text-base font-semibold">No medicines found</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search
                    ? `No products matching "${search}". Try searching by generic formula, brand name, SKU or barcode.`
                    : 'No products available for this filter.'}
                </p>
              </div>
              {search && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    searchRef.current?.focus()
                  }}
                >
                  Clear search
                </Button>
              )}
            </div>
          )}

          {/* Product Cards Grid */}
          {!fetchError && displayedProducts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayedProducts.map((p) => {
                const outOfStock = p.availableQuantity <= 0
                const inCartQty = cartQuantities.get(p.id) || 0
                const isRx = p.isPrescriptionRequired || RX_SCHEDULES.has(p.drugSchedule)
                const MedIcon = getMedicineIcon(p.unitOfMeasure, p.categoryName)
                const isLowStock = p.availableQuantity > 0 && p.availableQuantity <= 10

                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addToCart(p)}
                    className={cn(
                      'group relative flex min-h-[160px] flex-col justify-between rounded-xl border bg-card p-3.5 text-left transition-all',
                      'hover:border-primary hover:shadow-md active:scale-[0.98]',
                      'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
                      inCartQty > 0 &&
                        'border-primary/80 bg-primary/[0.03] shadow-sm ring-1 ring-primary/50',
                      outOfStock &&
                        'cursor-not-allowed bg-muted/40 opacity-60 hover:border-border hover:shadow-none'
                    )}
                  >
                    {/* Top Row: Unit Badge, Rx Badge & Cart Count */}
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <MedIcon className="h-3.5 w-3.5" />
                        </div>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                          {p.unitOfMeasure}
                        </Badge>
                        {isRx && (
                          <Badge
                            variant="destructive"
                            className="px-1.5 py-0 text-[10px] font-bold"
                          >
                            Rx
                          </Badge>
                        )}
                      </div>

                      {/* In-cart Indicator Badge */}
                      {inCartQty > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                          <Check className="h-3 w-3 stroke-[3]" />
                          {inCartQty}
                        </span>
                      )}
                    </div>

                    {/* Middle: Medicine Name & Composition / Generic */}
                    <div className="my-2">
                      <h4 className="line-clamp-2 text-xs font-semibold leading-tight text-foreground transition-colors group-hover:text-primary sm:text-sm">
                        {p.name}
                      </h4>
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                        {p.genericName || p.composition || p.categoryName || 'General Medicine'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                        {p.sku}
                      </p>
                      {p.rackCode && (
                        <Badge variant="outline" className="mt-1 px-1.5 py-0 text-[10px]">
                          {p.rackCode}
                        </Badge>
                      )}
                    </div>

                    {/* Bottom: Price & Stock Status */}
                    <div className="flex items-center justify-between border-t border-border/50 pt-2">
                      <span className="text-sm font-bold text-foreground">
                        {formatCurrency(p.mrp)}
                      </span>

                      {/* Stock availability indicator */}
                      {outOfStock ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3 w-3" />
                          {p.availableQuantity} left
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          {p.availableQuantity} in stock
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: Bill / Cart Panel ───────────────────────── */}
      <div className="flex w-full flex-col border-t bg-card shadow-sm lg:w-[400px] lg:border-t-0">
        {/* Bill Panel Header */}
        <div className="flex items-center gap-2 border-b bg-muted/20 p-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-none">Active Bill</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {cart.length} {cart.length === 1 ? 'line item' : 'line items'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => {
                setHeldLabel('')
                void saveHeldBill()
              }}
              disabled={cart.length === 0}
            >
              Hold
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearCart}
              disabled={cart.length === 0}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {/* Cart Items Scroll Area */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
          {cart.length === 0 && (
            <div className="flex h-56 flex-col items-center justify-center gap-2.5 text-center text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                <ShoppingCart className="h-6 w-6 opacity-40" />
              </div>
              <div>
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click any medicine card from the grid to add it to this bill.
                </p>
              </div>
            </div>
          )}

          {cart.map((c) => {
            const over = c.discountPercent > config.maxDiscountPercent && !canDiscountOverride
            const tabsPerStrip = c.tabsPerStrip ?? 1
            const totalBaseQty = c.quantity * tabsPerStrip + c.looseUnits
            const atMaxStock = totalBaseQty >= c.availableQuantity
            const billableQuantity = c.quantity + c.looseUnits / tabsPerStrip

            return (
              <div
                key={c.productId}
                className="shadow-xs rounded-xl border border-border/70 bg-background p-3 transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-xs font-semibold text-foreground">
                      {c.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{c.sku}</span> · {formatCurrency(c.mrp)}/
                      {c.unitOfMeasure}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(c.productId)}
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-md hover:bg-background"
                      onClick={() => setQty(c.productId, c.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-xs font-bold tabular-nums">
                      {c.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={atMaxStock}
                      className="h-6 w-6 rounded-md hover:bg-background disabled:opacity-40"
                      onClick={() => setQty(c.productId, c.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {tabsPerStrip > 1 && (
                    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground">tabs</span>
                      <Input
                        type="number"
                        min={0}
                        max={tabsPerStrip - 1}
                        value={c.looseUnits || ''}
                        onChange={(e) => setLooseUnits(c.productId, Number(e.target.value))}
                        placeholder="0"
                        className="h-6 w-12 bg-background text-right text-xs tabular-nums"
                        aria-label={`Loose tablets for ${c.name}`}
                      />
                    </div>
                  )}

                  {/* Discount Input */}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={c.discountPercent || ''}
                      onChange={(e) => setDiscount(c.productId, Number(e.target.value))}
                      placeholder="0"
                      className="h-7 w-14 text-right text-xs tabular-nums"
                      disabled={!canDiscount}
                      aria-label={`Discount % for ${c.name}`}
                    />
                    <span className="text-[11px] text-muted-foreground">% off</span>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      {formatCurrency(
                        billableQuantity * c.mrp * (1 - (c.discountPercent || 0) / 100)
                      )}
                    </span>
                  </div>
                </div>

                {tabsPerStrip > 1 && c.looseUnits > 0 && (
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {c.quantity} strips + {c.looseUnits} loose tabs ({totalBaseQty} base units)
                  </p>
                )}

                {atMaxStock && (
                  <p className="mt-1.5 text-[10px] font-medium text-amber-600">
                    Maximum available branch stock reached ({c.availableQuantity})
                  </p>
                )}

                {over && (
                  <p className="mt-1 text-[10px] font-medium text-destructive">
                    Exceeds {config.maxDiscountPercent}% limit — requires discount override
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Bill Summary & Charge Section */}
        <div className="space-y-3 border-t bg-muted/10 p-4">
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">
                {formatCurrency(pricing.totals.subtotal)}
              </dd>
            </div>
            {pricing.totals.discountAmount > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{formatCurrency(pricing.totals.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GST (included/added)</dt>
              <dd className="font-medium tabular-nums">
                {formatCurrency(pricing.totals.taxAmount)}
              </dd>
            </div>
            {config.roundOffTotal && pricing.totals.roundOffDifference !== 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Round-off</dt>
                <dd className="tabular-nums">
                  {formatCurrency(pricing.totals.roundOffDifference)}
                </dd>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-extrabold text-foreground">
              <dt>Total Amount</dt>
              <dd className="tabular-nums text-primary">
                {formatCurrency(pricing.totals.totalAmount)}
              </dd>
            </div>
          </dl>

          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Invoice remarks / customer notes (optional)"
            className="h-8 text-xs placeholder:text-muted-foreground"
          />

          <Button
            className="h-11 w-full gap-2 text-sm font-bold shadow-md"
            size="lg"
            onClick={() => openPayment()}
            disabled={cart.length === 0}
          >
            <Calculator className="h-4 w-4" />
            Charge {formatCurrency(pricing.totals.totalAmount)}
          </Button>
        </div>
      </div>

      {/* ─── Payment Dialog ─────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take Payment</DialogTitle>
            <DialogDescription>
              Total due is{' '}
              <span className="font-bold text-foreground">
                {formatCurrency(pricing.totals.totalAmount)}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="rounded-lg border bg-muted/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Select value={p.method} onValueChange={(v) => updatePayment(i, { method: v })}>
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.filter((m) => m !== CREDIT || canCredit).map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
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
                    className="h-9 flex-1 text-right text-xs tabular-nums"
                  />
                  {payments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
                      ? 'Change given / memo (optional)'
                      : p.method === 'UPI'
                        ? 'UPI transaction ID (optional)'
                        : 'Reference / cheque number'
                  }
                  className="h-8 text-xs"
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={addPaymentLine} className="text-xs">
                + Split Payment
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setPayments([
                    { method: 'CASH', amount: pricing.totals.totalAmount, reference: '' },
                  ])
                }
              >
                Exact Cash
              </Button>
              <Button variant="outline" size="sm" onClick={quickCash} className="text-xs">
                Quick Round Cash
              </Button>
            </div>

            {payments.some((p) => p.method === CREDIT) && config.requireCustomerForCredit && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Badge variant="outline" className="bg-primary/10 text-[10px]">
                    Credit Sale — Customer Details Required
                  </Badge>
                </div>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Full Name *"
                  className="h-8 bg-background text-xs"
                />
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone Number (optional)"
                  className="h-8 bg-background text-xs"
                />
              </div>
            )}

            {needsPrescription && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/80 p-3 dark:bg-amber-950/30">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  This bill contains Schedule H/X or prescription-only items. A verified
                  prescription is required.
                </p>
                {approvedPrescriptions.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Select Verified Prescription:
                    </span>
                    <select
                      className="h-8 w-full rounded border border-amber-300 bg-background px-2 text-xs text-foreground"
                      value={prescriptionId}
                      onChange={(e) => setPrescriptionId(e.target.value)}
                    >
                      <option value="">-- Select Prescription or enter ID below --</option>
                      {approvedPrescriptions.map((rx) => (
                        <option key={rx.id} value={rx.id}>
                          {rx.prescriptionNumber ?? rx.id} ({rx.patientName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Input
                  value={prescriptionId}
                  onChange={(e) => setPrescriptionId(e.target.value)}
                  placeholder="Prescription ID / Reference"
                  className="h-8 bg-background text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-xs">
              <span className="text-muted-foreground">Received</span>
              <span className="font-bold tabular-nums text-foreground">
                {formatCurrency(received)}
              </span>
              <span className="text-muted-foreground">Balance Due</span>
              <span className="font-bold tabular-nums text-primary">
                {formatCurrency(balanceDue)}
              </span>
            </div>

            {payments.some((p) => p.method === CREDIT) && (
              <p className="text-[11px] text-muted-foreground">
                Credit payment records the outstanding balance as a customer ledger debit.
              </p>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitSale}
              disabled={charging || cart.length === 0}
              className="gap-1.5"
            >
              {charging && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Held Bills Dialog ──────────────────────────────── */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Held Bills</DialogTitle>
            <DialogDescription>
              Hold current cart to resume later or load an existing customer bill.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={heldLabel}
              onChange={(e) => setHeldLabel(e.target.value)}
              placeholder="Label / Customer name (optional)"
              className="h-9 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={saveHeldBill}
              disabled={cart.length === 0}
              className="shrink-0 text-xs"
            >
              Hold Current
            </Button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {heldBills.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No held bills found</p>
            )}
            {heldBills.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-lg border p-2.5 transition-colors hover:bg-muted/40"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => loadHeldBill(b.id)}
                >
                  <div className="truncate text-xs font-semibold text-foreground">
                    {b.label || 'Unlabelled bill'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteHeldBill(b.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Printable Receipt Dialog ───────────────────────── */}
      <Dialog open={completedSale !== null} onOpenChange={(v) => !v && setCompletedSale(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Sale Completed Successfully
            </DialogTitle>
            <DialogDescription>
              Invoice {completedSale ? String(completedSale.invoiceNumber ?? '') : ''}
            </DialogDescription>
          </DialogHeader>

          {completedSale && (
            <div className="rounded-lg border bg-muted/5 p-4 font-sans">
              <div className="mb-3 border-b pb-2 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  PharmaCare
                </div>
                <div className="text-sm font-bold text-foreground">
                  {String(completedSale.invoiceNumber ?? '')}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(String(completedSale.saleDate ?? '')).toLocaleString()}
                  {completedSale.customer ? ` · ${completedSale.customer.name}` : ''}
                </div>
              </div>

              <div className="space-y-1 text-xs">
                {completedSale.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">
                      {it.productName} × {it.quantity}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(it.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1 border-t border-dashed pt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(completedSale.subtotal)}
                  </span>
                </div>
                {Number(completedSale.discountAmount) > 0 && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      −{formatCurrency(completedSale.discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(completedSale.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1 text-sm font-bold">
                  <span>Total Paid</span>
                  <span className="tabular-nums text-primary">
                    {formatCurrency(completedSale.totalAmount)}
                  </span>
                </div>
                {Number(completedSale.balanceDue) > 0 && (
                  <div className="flex justify-between font-semibold text-destructive">
                    <span>Balance Due</span>
                    <span className="tabular-nums">{formatCurrency(completedSale.balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCompletedSale(null)}>
              New Transaction
            </Button>
            <Button size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Schedule H1 Capture Dialog ─────────────────────────────────── */}
      <Dialog open={h1ModalOpen} onOpenChange={setH1ModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule H1 / Narcotic Details</DialogTitle>
            <DialogDescription>
              Patient and Prescribing Doctor information is strictly required for Schedule H1 and
              Narcotic dispensing.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!h1PatientName || !h1DoctorName || !h1DoctorRegNo) {
                toast.error('Please fill required H1 fields')
                return
              }
              setH1ModalOpen(false)
              setPayments([{ method: 'CASH', amount: pricing.totals.totalAmount, reference: '' }])
              setPayOpen(true)
            }}
            className="space-y-4"
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">
                  Patient Name <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  value={h1PatientName}
                  onChange={(e) => setH1PatientName(e.target.value)}
                  placeholder="Patient full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Patient Address</label>
                <Input
                  value={h1PatientAddress}
                  onChange={(e) => setH1PatientAddress(e.target.value)}
                  placeholder="Patient address"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Patient Phone</label>
                <Input
                  value={h1PatientPhone}
                  onChange={(e) => setH1PatientPhone(e.target.value)}
                  placeholder="Patient phone number"
                />
              </div>
              <Separator />
              <div>
                <label className="text-xs font-semibold">
                  Doctor Name <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  value={h1DoctorName}
                  onChange={(e) => setH1DoctorName(e.target.value)}
                  placeholder="Dr. Name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">
                  Doctor Registration No <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  value={h1DoctorRegNo}
                  onChange={(e) => setH1DoctorRegNo(e.target.value)}
                  placeholder="Medical Council Registration Number"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setH1ModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Continue to Payment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
