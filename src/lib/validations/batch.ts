import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────

export const BatchStatusEnum = z.enum(['ACTIVE', 'BLOCKED', 'EXPIRED', 'DISPOSED', 'EXHAUSTED'])

export const DisposalReasonEnum = z.enum([
  'EXPIRED',
  'DAMAGED',
  'RECALLED',
  'CONTAMINATED',
  'OTHER',
])

// ─── Query Schema ─────────────────────────────────────────────

export const batchListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  productId: z.string().optional(),
  status: BatchStatusEnum.optional(),
  sortBy: z.enum(['expiryDate', 'batchNumber', 'createdAt']).default('expiryDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

// ─── Create Batch (internal — used by GRN/Purchases) ─────────

export const createBatchSchema = z
  .object({
    productId: z.string().min(1, 'Product is required'),
    batchNumber: z.string().min(1, 'Batch number is required').max(100),
    manufacturingDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date(),
    purchasePrice: z.number().nonnegative('Purchase price cannot be negative').default(0),
    mrp: z.number().nonnegative('MRP cannot be negative').default(0),
    quantity: z.number().int('Quantity must be a whole number').nonnegative().default(0),
    supplierRef: z.string().max(200).nullable().optional(),
    purchaseId: z.string().optional(),
    branchId: z.string().optional(),
  })
  .refine(
    (d) => !d.manufacturingDate || d.expiryDate >= d.manufacturingDate,
    'Expiry date must be on or after the manufacturing date'
  )

export type CreateBatchInput = z.input<typeof createBatchSchema>

// ─── Update Batch (non-lifecycle fields on ACTIVE batches only) ─

export const updateBatchSchema = z
  .object({
    batchNumber: z.string().min(1, 'Batch number is required').max(100).optional(),
    manufacturingDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().optional(),
    purchasePrice: z.number().nonnegative('Purchase price cannot be negative').optional(),
    mrp: z.number().nonnegative('MRP cannot be negative').optional(),
    supplierRef: z.string().max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'No updates provided')
  .refine(
    (d) => !d.expiryDate || !d.manufacturingDate || d.expiryDate >= d.manufacturingDate,
    'Expiry date must be on or after the manufacturing date'
  )

export type UpdateBatchInput = z.input<typeof updateBatchSchema>

// ─── Block / Dispose ──────────────────────────────────────────

export const blockBatchSchema = z.object({
  reason: z.string().min(2, 'Reason is required (minimum 2 characters)').max(500),
})

export const disposeBatchSchema = z.object({
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than zero'),
  reason: DisposalReasonEnum,
  notes: z.string().max(2000).optional(),
})

export type DisposeBatchInput = z.infer<typeof disposeBatchSchema>
