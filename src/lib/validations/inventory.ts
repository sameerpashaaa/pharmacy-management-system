import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────

export const MovementTypeEnum = z.enum([
  'IN',
  'OUT',
  'ADJUSTMENT',
  'RETURN_IN',
  'RETURN_OUT',
  'TRANSFER',
  'WRITE_OFF',
])

export const AdjustmentTypeEnum = z.enum([
  'PHYSICAL_COUNT',
  'DAMAGE',
  'THEFT',
  'EXPIRY',
  'CORRECTION',
  'OPENING_STOCK',
])

export const AdjustmentStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

export const StockStatusEnum = z.enum(['in_stock', 'low_stock', 'out_of_stock', 'overstock'])

// ─── Query Schemas ────────────────────────────────────────────

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  productId: z.string().optional(),
  status: StockStatusEnum.optional(),
  sortBy: z.enum(['product', 'totalQuantity', 'availableQuantity', 'updatedAt']).default('product'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export const movementListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  productId: z.string().optional(),
  type: MovementTypeEnum.optional(),
})

export const adjustmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  productId: z.string().optional(),
  status: AdjustmentStatusEnum.optional(),
  adjustmentType: AdjustmentTypeEnum.optional(),
})

// ─── Create Adjustment ────────────────────────────────────────

export const createAdjustmentSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  productId: z.string().min(1, 'Product is required'),
  batchId: z.string().optional(),
  adjustmentType: AdjustmentTypeEnum,
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .refine((q) => q !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(2, 'Reason is required (minimum 2 characters)').max(500),
  notes: z.string().max(2000).optional(),
  evidenceFileId: z.string().optional().nullable(),
})

export const approveAdjustmentSchema = z.object({
  evidenceFileId: z.string().optional().nullable(),
})

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>
