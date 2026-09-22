import type { PrescriptionStatus } from '@/lib/validations/prescription'

export const PRESCRIPTION_STATUS_META: Record<
  PrescriptionStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  }
> = {
  PENDING: { label: 'Pending Review', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  DISPENSED: { label: 'Dispensed', variant: 'info' },
  EXPIRED: { label: 'Expired', variant: 'secondary' },
}
