export type SaleStatusRow = 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED'

export type PaymentStatusRow = 'PAID' | 'PARTIAL' | 'CREDIT' | 'OVERPAID'

export const SALE_STATUS_META: Record<
  SaleStatusRow,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  PARTIALLY_RETURNED: { label: 'Partially Returned', variant: 'warning' },
  FULLY_RETURNED: { label: 'Fully Returned', variant: 'secondary' },
}

export const PAYMENT_STATUS_META: Record<
  PaymentStatusRow,
  { label: string; variant: 'success' | 'warning' | 'info' | 'outline' }
> = {
  PAID: { label: 'Paid', variant: 'success' },
  PARTIAL: { label: 'Partial', variant: 'warning' },
  CREDIT: { label: 'Credit', variant: 'info' },
  OVERPAID: { label: 'Overpaid', variant: 'outline' },
}
