'use client'

// ─────────────────────────────────────────────────────────────
// Component — AdjustmentFormDialog
// Creates a stock adjustment (opening stock / damage / expiry /
// correction / etc). Adjustments <= 10 units auto-approve;
// larger ones go to PENDING for a manager/chief pharmacist.
// ─────────────────────────────────────────────────────────────
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'

interface AdjustmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultBranchId?: string | null
  onCreated: (message: string) => void
}

interface BranchOption {
  id: string
  name: string
  code: string | null
}

interface ProductOption {
  id: string
  name: string
  sku: string
}

const ADJUSTMENT_TYPES = [
  { value: 'PHYSICAL_COUNT', label: 'Physical Count' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'THEFT', label: 'Theft' },
  { value: 'EXPIRY', label: 'Expiry' },
  { value: 'CORRECTION', label: 'Correction' },
  { value: 'OPENING_STOCK', label: 'Opening Stock' },
]

export function AdjustmentFormDialog({
  open,
  onOpenChange,
  defaultBranchId,
  onCreated,
}: AdjustmentFormDialogProps) {
  const toast = useToast()

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('')

  const [branchId, setBranchId] = useState<string>(defaultBranchId ?? '')
  const [productId, setProductId] = useState<string>('')
  const [adjustmentType, setAdjustmentType] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state each time the dialog opens
  useEffect(() => {
    if (open) {
      setBranchId(defaultBranchId ?? '')
      setProductId('')
      setAdjustmentType('')
      setQuantity('')
      setReason('')
      setNotes('')
      setError(null)
    }
  }, [open, defaultBranchId])

  // Load branches once
  useEffect(() => {
    fetch('/api/inventory/branches')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBranches(d.data as BranchOption[])
      })
      .catch(() => undefined)
  }, [])

  // Load products when the dialog opens
  useEffect(() => {
    if (!open) return
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('limit', '100')
    params.set('isActive', 'true')
    if (debouncedProductSearch) params.set('search', debouncedProductSearch)
    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProducts((d.data as ProductOption[]) ?? [])
      })
      .catch(() => undefined)
  }, [open, debouncedProductSearch])

  // Debounce product search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductSearch(productSearch), 350)
    return () => clearTimeout(t)
  }, [productSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsedQuantity = Number(quantity)
    if (!branchId) {
      setError('Please select a branch.')
      return
    }
    if (!productId) {
      setError('Please select a product.')
      return
    }
    if (!adjustmentType) {
      setError('Please select an adjustment type.')
      return
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      setError('Quantity must be a non-zero number.')
      return
    }
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          productId,
          adjustmentType,
          quantity: parsedQuantity,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        message?: string
        error?: { message?: string }
      }
      if (res.ok && json.success) {
        toast.success(json.message ?? 'Adjustment created')
        onCreated(json.message ?? 'Adjustment created')
        onOpenChange(false)
      } else {
        setError(json.error?.message ?? 'Failed to create adjustment.')
      }
    } catch {
      setError('Failed to create adjustment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New Stock Adjustment</DialogTitle>
            <DialogDescription>
              Adjustments of 10 units or less are auto-approved; larger ones require a manager.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Select
                  value={branchId}
                  onValueChange={setBranchId}
                  disabled={branches.length === 0}
                >
                  <SelectTrigger id="branch">
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Adjustment Type</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setProductId('')
                    }}
                    placeholder="Search name or SKU…"
                    className="pl-7"
                  />
                </div>
                <Select
                  value={productId}
                  onValueChange={setProductId}
                  disabled={products.length === 0}
                >
                  <SelectTrigger id="product" className="w-56">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity (positive adds, negative reduces)</Label>
                <Input
                  id="qty"
                  type="number"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 5 or -3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
