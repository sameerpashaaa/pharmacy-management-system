import { z } from 'zod'

export const RestockDecisionEnum = z.enum([
  'RESTOCK',
  'QUARANTINE',
  'DAMAGE_WRITE_OFF',
])

export type RestockDecision = z.infer<typeof RestockDecisionEnum>

export const SaleReturnStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REFUNDED',
  'CREDITED',
  'REJECTED',
])

export type SaleReturnStatus = z.infer<typeof SaleReturnStatusEnum>

export const CreditNoteStatusEnum = z.enum([
  'ACTIVE',
  'PARTIALLY_USED',
  'FULLY_USED',
  'EXPIRED',
  'CANCELLED',
])

export type CreditNoteStatus = z.infer<typeof CreditNoteStatusEnum>

export const createSaleReturnItemSchema = z.object({
  saleItemId: z.string().min(1, 'Sale item ID is required'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than 0'),
  reason: z.string().trim().max(255).optional().nullable(),
  restockDecision: RestockDecisionEnum.default('RESTOCK'),
  batchId: z.string().optional().nullable(),
})

export type CreateSaleReturnItemInput = z.input<typeof createSaleReturnItemSchema>

export const createSaleReturnSchema = z.object({
  saleId: z.string().min(1, 'Sale ID is required'),
  reason: z.string().trim().min(1, 'Reason for return is required').max(500),
  refundMethod: z.enum([
    'CASH',
    'CARD',
    'UPI',
    'NETBANKING',
    'CHEQUE',
    'CREDIT',
    'WALLET',
  ]),
  refundRef: z.string().trim().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(createSaleReturnItemSchema)
    .min(1, 'At least one item must be returned'),
})

export type CreateSaleReturnInput = z.input<typeof createSaleReturnSchema>

export const saleReturnQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: SaleReturnStatusEnum.optional(),
  saleId: z.string().optional(),
  customerId: z.string().optional(),
  branchId: z.string().optional(),
  sortBy: z
    .enum(['createdAt', 'returnDate', 'totalAmount'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type SaleReturnQueryParams = z.infer<typeof saleReturnQuerySchema>

export const creditNoteQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: CreditNoteStatusEnum.optional(),
  customerId: z.string().optional(),
  sortBy: z.enum(['createdAt', 'amount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreditNoteQueryParams = z.infer<typeof creditNoteQuerySchema>
