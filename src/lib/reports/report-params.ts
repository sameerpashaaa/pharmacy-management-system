/**
 * Shared query-parameter parsing for report API routes.
 *
 * Throwing `Error('Validation: ...')` maps to HTTP 400 with code
 * VALIDATION in the report routes (mirrors the app-wide errStatus
 * convention). Invalid input must never reach Prisma (which would 500).
 */

export const REPORT_MAX_LIMIT = 2000
export const REPORT_DEFAULT_LIMIT = 500
export const REPORT_MAX_DAYS_THRESHOLD = 365

export function parseReportDate(value: unknown, name: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Validation: invalid ${name}`)
  }
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error(`Validation: invalid ${name}`)
  }
  return date
}

export function parseOptionalReportDate(value: unknown, name: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return parseReportDate(value, name)
}

export function parseDateRange(query: Record<string, string | undefined>): {
  startDate: Date
  endDate: Date
} {
  const startDate =
    query.startDate !== undefined && query.startDate !== ''
      ? parseReportDate(query.startDate, 'startDate')
      : new Date(0)
  const endDate =
    query.endDate !== undefined && query.endDate !== ''
      ? parseReportDate(query.endDate, 'endDate')
      : new Date()
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('Validation: startDate must not be after endDate')
  }
  return { startDate, endDate }
}

export function parseDaysThreshold(value: unknown): number {
  if (value === undefined || value === null || value === '') return 90
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > REPORT_MAX_DAYS_THRESHOLD) {
    throw new Error('Validation: invalid daysThreshold')
  }
  return days
}

export function parseReportPagination(query: Record<string, string | undefined>): {
  page: number
  limit: number
} {
  let page = 1
  if (query.page !== undefined && query.page !== '') {
    page = Number(query.page)
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('Validation: invalid page')
    }
  }
  let limit = REPORT_DEFAULT_LIMIT
  if (query.limit !== undefined && query.limit !== '') {
    limit = Number(query.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > REPORT_MAX_LIMIT) {
      throw new Error('Validation: invalid limit')
    }
  }
  return { page, limit }
}
