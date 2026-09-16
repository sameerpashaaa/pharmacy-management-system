'use client'

import { Printer, XCircle } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'

import { cancelSaleAction } from './sale-actions'

export function SaleActionButtons({
  saleId,
  canCancel,
}: {
  saleId: string
  canCancel: boolean
}) {
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()
  const router = useRouter()

  const handlePrint = () => {
    // A simple window.print() approach for receipt. In reality, you'd open a receipt template.
    window.print()
  }

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast.error('Reason required', 'Please provide a cancellation reason.')
      return
    }
    try {
      setIsLoading(true)
      await cancelSaleAction(saleId, reason)
      toast.success('Sale Cancelled', 'Inventory has been restored.')
      setIsCancelOpen(false)
      router.refresh()
    } catch (error) {
      toast.error('Error', error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handlePrint} className="print:hidden">
          <Printer className="mr-2 h-4 w-4" />
          Print Receipt
        </Button>
        {canCancel && (
          <Button variant="destructive" onClick={() => setIsCancelOpen(true)} className="print:hidden">
            <XCircle className="mr-2 h-4 w-4" />
            Cancel Sale
          </Button>
        )}
      </div>

      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this sale? This action cannot be undone. Inventory will be restored.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for cancellation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelOpen(false)} disabled={isLoading}>
              Close
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isLoading}>
              {isLoading ? 'Cancelling...' : 'Confirm Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
