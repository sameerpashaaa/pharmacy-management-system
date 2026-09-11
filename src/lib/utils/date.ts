import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'

/**
 * Format a date to dd/MM/yyyy
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return format(d, 'dd/MM/yyyy')
}

/**
 * Format a date to dd/MM/yyyy HH:mm
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return format(d, 'dd/MM/yyyy HH:mm')
}

/**
 * Format a date to time only HH:mm
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return format(d, 'HH:mm')
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'
  return formatDistanceToNow(d, { addSuffix: true })
}

/**
 * Format a date for GST period (MM-YYYY)
 */
export function formatGstPeriod(date: Date): string {
  return format(date, 'MM-yyyy')
}

/**
 * Get days until expiry. Negative = already expired.
 */
export function daysUntilExpiry(expiryDate: Date | string): number {
  const d = typeof expiryDate === 'string' ? parseISO(expiryDate) : expiryDate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = d.getTime() - today.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
