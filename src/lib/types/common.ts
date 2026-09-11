// ─────────────────────────────────────────────────────────────
// TypeScript Types — Common
// ─────────────────────────────────────────────────────────────

export type ApiResponse<T = unknown> = {
  success: boolean
  data?: T
  message?: string
  error?: {
    code: string
    message: string
    details?: Array<{ field: string; message: string }>
  }
}

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  pages: number
}

export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: PaginationMeta
}

export type PaginationParams = {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
}

export type DateRange = {
  from: Date
  to: Date
}

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}
