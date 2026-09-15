'use client'

// ─────────────────────────────────────────────────────────────
// Component — PrescriptionDetailActions
// Pharmacist review controls (Approve & Reject with reasons).
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'

interface PrescriptionDetailActionsProps {
  prescriptionId: string
  status: string
  canApprove: boolean
}

export function PrescriptionDetailActions({
  prescriptionId,
  status,
  canApprove,
}: PrescriptionDetailActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (status !== 'PENDING' || !canApprove) {
    return null
  }

  const handleApprove = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approveNotes.trim() || undefined }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Failed to approve prescription')
      }

      toast.success('Prescription Approved', 'The prescription has been approved for dispensing.')
      setApproveOpen(false)
      router.refresh()
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Reason Required', 'Please state why this prescription is rejected.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Failed to reject prescription')
      }

      toast.success('Prescription Rejected', 'The prescription has been marked as rejected.')
      setRejectOpen(false)
      router.refresh()
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Rejection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Approve Prescription
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Prescription</DialogTitle>
            <DialogDescription>
              Verify that the prescription is authentic, legible, and meets regulatory standards before approving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="approveNotes">Pharmacist Verification Notes (Optional)</Label>
            <Textarea
              id="approveNotes"
              placeholder="e.g. Dosage verified with prescribing physician, valid for 30 days."
              value={approveNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setApproveNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? 'Approving...' : 'Confirm Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">Reject</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Prescription</DialogTitle>
            <DialogDescription>
              Please record a clinical or administrative reason for rejecting this prescription.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rejectionReason">Rejection Reason *</Label>
            <Textarea
              id="rejectionReason"
              placeholder="e.g. Expired prescription date, illegible doctor stamp, contra-indicated medication..."
              value={rejectionReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectionReason(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              {loading ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
