'use client'

// ─────────────────────────────────────────────────────────────
// Component — BatchDetailActions
// Update / block / dispose actions for a single batch, wired to
// the batch lifecycle API routes.
// ─────────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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

interface BatchDetailActionsProps {
  batchId: string
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'DISPOSED' | 'EXHAUSTED'
  availableQuantity: number
  initial: {
    batchNumber: string
    manufacturingDate: string
    expiryDate: string
    purchasePrice: string
    mrp: string
    supplierRef: string | null
  }
  canUpdate: boolean
  canBlock: boolean
  canDispose: boolean
}

const DISPOSAL_REASONS = [
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'RECALLED', label: 'Recalled' },
  { value: 'CONTAMINATED', label: 'Contaminated' },
  { value: 'OTHER', label: 'Other' },
]

export function BatchDetailActions({
  batchId,
  status,
  availableQuantity,
  initial,
  canUpdate,
  canBlock,
  canDispose,
}: BatchDetailActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [updateOpen, setUpdateOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [disposeOpen, setDisposeOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update form state
  const [batchNumber, setBatchNumber] = useState(initial.batchNumber)
  const [manufacturingDate, setManufacturingDate] = useState(initial.manufacturingDate)
  const [expiryDate, setExpiryDate] = useState(initial.expiryDate)
  const [purchasePrice, setPurchasePrice] = useState(initial.purchasePrice)
  const [mrp, setMrp] = useState(initial.mrp)
  const [supplierRef, setSupplierRef] = useState(initial.supplierRef ?? '')

  // Block disposal form state
  const [blockReason, setBlockReason] = useState('')
  const [disposeQuantity, setDisposeQuantity] = useState('')
  const [disposeReason, setDisposeReason] = useState('')
  const [disposeNotes, setDisposeNotes] = useState('')

  async function runAction(fn: () => Promise<{ ok: boolean; message: string }>) {
    setSubmitting(true)
    setError(null)
    try {
      const { ok, message } = await fn()
      if (ok) {
        toast.success(message)
        router.refresh()
      } else {
        setError(message)
      }
    } catch {
      setError('Failed to perform action.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitUpdate(e: React.FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber: batchNumber.trim(),
          manufacturingDate: manufacturingDate ? `${manufacturingDate}T00:00:00.000Z` : null,
          expiryDate: `${expiryDate}T00:00:00.000Z`,
          purchasePrice: Number(purchasePrice),
          mrp: Number(mrp),
          supplierRef: supplierRef.trim() || null,
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        error?: { message?: string }
      }
      if (res.ok && json.success) {
        setUpdateOpen(false)
        return { ok: true, message: json.message ?? 'Batch updated' }
      }
      return { ok: false, message: json.error?.message ?? 'Failed to update batch' }
    })
  }

  async function submitBlock(e: React.FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await fetch(`/api/batches/${batchId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: blockReason.trim() }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        error?: { message?: string }
      }
      if (res.ok && json.success) {
        setBlockOpen(false)
        return { ok: true, message: json.message ?? 'Batch blocked' }
      }
      return { ok: false, message: json.error?.message ?? 'Failed to block batch' }
    })
  }

  async function submitDispose(e: React.FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await fetch(`/api/batches/${batchId}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: Number(disposeQuantity),
          reason: disposeReason,
          notes: disposeNotes.trim() || undefined,
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        error?: { message?: string }
      }
      if (res.ok && json.success) {
        setDisposeOpen(false)
        return { ok: true, message: json.message ?? 'Batch disposed' }
      }
      return { ok: false, message: json.error?.message ?? 'Failed to dispose batch' }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdate && (
        <Button size="sm" onClick={() => setUpdateOpen(true)} disabled={status !== 'ACTIVE'}>
          Edit
        </Button>
      )}
      {canBlock && (
        <Button size="sm" onClick={() => setBlockOpen(true)} disabled={status !== 'ACTIVE'}>
          Block
        </Button>
      )}
      {canDispose && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDisposeOpen(true)}
          disabled={status === 'DISPOSED' || status === 'EXHAUSTED' || availableQuantity === 0}
        >
          Dispose
        </Button>
      )}

      {/* Update dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitUpdate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit Batch</DialogTitle>
              <DialogDescription>
                Batch {batchId.slice(0, 8)} — lifecycle fields are system-managed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Batch Number</Label>
                  <Input
                    id="batchNumber"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierRef">Supplier Reference (optional)</Label>
                  <Input
                    id="supplierRef"
                    value={supplierRef}
                    onChange={(e) => setSupplierRef(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manufacturingDate">Manufacturing Date</Label>
                  <Input
                    id="manufacturingDate"
                    type="date"
                    value={manufacturingDate}
                    onChange={(e) => setManufacturingDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mrp">MRP</Label>
                  <Input
                    id="mrp"
                    type="number"
                    min="0"
                    step="0.01"
                    value={mrp}
                    onChange={(e) => setMrp(e.target.value)}
                    required
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setUpdateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitBlock} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Block Batch</DialogTitle>
              <DialogDescription>
                Quarantine this batch so it cannot be sold. Blocked batches can still be disposed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="blockReason">Reason</Label>
                <Input
                  id="blockReason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Why is this batch being blocked?"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setBlockOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !blockReason.trim()}>
                {submitting ? 'Blocking…' : 'Block Batch'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dispose dialog */}
      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitDispose} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Dispose Batch</DialogTitle>
              <DialogDescription>
                Record a write-off from this batch. Disposing its full remaining quantity marks the
                batch as disposed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="disposeQty">Quantity (available: {availableQuantity})</Label>
                  <Input
                    id="disposeQty"
                    type="number"
                    min="1"
                    max={availableQuantity}
                    step="1"
                    value={disposeQuantity}
                    onChange={(e) => setDisposeQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disposeReason">Reason</Label>
                  <Select value={disposeReason} onValueChange={setDisposeReason}>
                    <SelectTrigger id="disposeReason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSAL_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="disposeNotes">Notes (optional)</Label>
                <textarea
                  id="disposeNotes"
                  value={disposeNotes}
                  onChange={(e) => setDisposeNotes(e.target.value)}
                  placeholder="Additional context…"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDisposeOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting || !disposeReason || !disposeQuantity}
              >
                {submitting ? 'Disposing…' : 'Record Disposal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
