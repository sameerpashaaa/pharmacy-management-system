/**
 * Format a number as INR currency
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '₹0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Format a number with Indian number system (commas)
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('en-IN').format(num)
}

/**
 * Parse currency string to number
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[₹,]/g, '')) || 0
}

/**
 * Round to 2 decimal places (accounting round)
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Calculate GST amounts from a taxable amount and rates
 */
export function calculateGst(
  taxableAmount: number,
  gstRate: number,
  isInterState = false
): { cgst: number; sgst: number; igst: number; total: number } {
  if (isInterState) {
    const igst = roundCurrency(taxableAmount * (gstRate / 100))
    return { cgst: 0, sgst: 0, igst, total: igst }
  }
  const halfRate = gstRate / 2
  const cgst = roundCurrency(taxableAmount * (halfRate / 100))
  const sgst = roundCurrency(taxableAmount * (halfRate / 100))
  return { cgst, sgst, igst: 0, total: cgst + sgst }
}
