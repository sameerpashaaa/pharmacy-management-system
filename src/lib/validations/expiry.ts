import { z } from 'zod'

// ─── Expiry Detection query schemas ──────────────────────────

export const ExpirySeverityEnum = z.enum(['CRITICAL', 'WARNING', 'INFO'])

const baseExpiryQuery = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  productId: z.string().optional(),
  branchId: z.string().optional(),
} as const

/** /api/expiry/expiring — ACTIVE batches within the 90-day window. */
export const expiringBatchesQuerySchema = z.object({
  ...baseExpiryQuery,
  severity: ExpirySeverityEnum.optional(),
})

/** /api/expiry/expired — batches already in EXPIRED status. */
export const expiredBatchesQuerySchema = z.object(baseExpiryQuery)

export type ExpiringBatchesQueryInput = z.infer<typeof expiringBatchesQuerySchema>
export type ExpiredBatchesQueryInput = z.infer<typeof expiredBatchesQuerySchema>
