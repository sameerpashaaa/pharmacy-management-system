import { z } from 'zod'

export const openingBalanceSchema = z.object({
  branchId: z.string().cuid(),
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  batchNumber: z.string().min(1).max(100),
  expiryDate: z.coerce.date(),
  manufacturingDate: z.coerce.date().nullable().optional(),
  purchasePrice: z.number().nonnegative(),
  mrp: z.number().positive(),
  supplierRef: z.string().max(100).optional(),
  evidenceFileId: z.string().cuid().optional(),
})

export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>