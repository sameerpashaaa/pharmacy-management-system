'use client'

import { CreditCard, Printer, XCircle } from 'lucide-react'
import Link from 'next/link'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'

import { cancelSaleAction } from './sale-actions'

export function SaleActionButtons({
  saleId,
  canCancel,
  canRecordPayment,
  customerId,
  balanceDue,
}: {
  saleId: string
  canCancel: boolean
  canRecordPayment: boolean
  customerId: string | null
  balanceDue: number
}) {
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(String(balanceDue))
  const [paymentMethod, setPaymentMethod] = useState<
    'CASH' | 'CARD' | 'UPI' | 'NETBANKING' | 'CHEQUE' | 'WALLET'
  >('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
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

  const handleRecordPayment = async () => {
    if (!customerId) {
      toast.error('No customer', 'Cannot record payment without a customer')
      return
    }
    const amt = Number(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('Invalid amount', 'Enter a payment amount greater than zero')
      return
    }
    if (amt > balanceDue + 0.01) {
      toast.error('Overpayment', `Amount ${amt} exceeds outstanding balance ${balanceDue}`)
      return
    }
    try {
      setPaymentSubmitting(true)
      const res = await fetch(`/api/finance/receivables/${customerId}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          paymentMethod,
          reference: paymentReference || undefined,
          notes: paymentNotes || undefined,
          paymentDate: new Date().toISOString(),
        }),
      })
      const j = (await res.json()) as
        { success: true; data: unknown } | { success: false; error: { message: string } }
      if (!res.ok || !('data' in j)) {
        const msg = 'error' in j ? j.error.message : `Payment failed (${res.status})`
        toast.error('Payment failed', msg)
        return
      }
      toast.success('Payment recorded', `${paymentMethod} ${amt} against sale ${saleId}`)
      setIsPaymentOpen(false)
      router.refresh()
    } catch (err) {
      toast.error('Payment failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handlePrint} className="print:hidden">
          <Printer className="mr-2 h-4 w-4" />
          Print Receipt
        </Button>
        {canRecordPayment && customerId && balanceDue > 0 && (
          <Button variant="default" onClick={() => setIsPaymentOpen(true)} className="print:hidden">
            <CreditCard className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        )}
        {canCancel && (
          <Button
            variant="destructive"
            onClick={() => setIsCancelOpen(true)}
            className="print:hidden"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancel Sale
          </Button>
        )}
      </div>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Outstanding{' '}
              <span className="font-semibold tabular-nums">{balanceDue.toFixed(2)}</span> against
              this invoice. Records a CUSTOMER payment that is later reconciled in receivables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="NETBANKING">Netbanking</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="WALLET">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input
                placeholder="Transaction / cheque no."
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Need a full view of customer receivables? Open the{' '}
              <Link
                href={`/finance/receivables/${customerId ?? ''}`}
                className="text-primary hover:underline"
              >
                customer ledger
              </Link>
              .
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPaymentOpen(false)}
              disabled={paymentSubmitting}
            >
              Close
            </Button>
            <Button onClick={handleRecordPayment} disabled={paymentSubmitting}>
              {paymentSubmitting ? 'Recording...' : 'Record payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this sale? This action cannot be undone. Inventory
              will be restored.
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
