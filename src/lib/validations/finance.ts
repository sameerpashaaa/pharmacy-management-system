import { z } from 'zod'

export const ledgerTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
export const gstTransactionTypeSchema = z.enum(['B2B', 'B2C', 'EXPORT', 'NIL_RATED'])

const financeDateRangeBaseSchema = z.object({
  branchId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export const financeDateRangeSchema = financeDateRangeBaseSchema.refine(
  (data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to),
  { message: 'From date must be before or equal to to date', path: ['from'] }
)

export const ledgerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  type: ledgerTypeSchema.optional(),
  sortBy: z.enum(['code', 'name', 'type', 'balance', 'createdAt']).default('code'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export const createLedgerSchema = z.object({
  code: z.string().min(1, 'Ledger code is required').max(30),
  name: z.string().min(1, 'Ledger name is required').max(120),
  type: ledgerTypeSchema,
  parentId: z.string().optional(),
  openingBalance: z.number().min(0).max(999999999.99).default(0),
})

export const createLedgerEntrySchema = z.object({
  ledgerId: z.string().min(1, 'Ledger is required'),
  type: z.enum(['DEBIT', 'CREDIT']),
  amount: z.number().positive('Amount must be positive').max(999999999.99),
  description: z.string().min(1, 'Description is required').max(500),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().max(80).optional(),
  entryDate: z.string().datetime({ offset: true }).optional(),
})

export const partyLedgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['ALL', 'OUTSTANDING', 'CLEAR']).default('OUTSTANDING'),
  sortBy: z.enum(['name', 'outstandingBalance', 'updatedAt']).default('outstandingBalance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const gstReportQuerySchema = financeDateRangeBaseSchema
  .extend({
    type: gstTransactionTypeSchema.optional(),
    returnPeriod: z
      .string()
      .regex(/^\d{2}-\d{4}$/, 'Return period must be MM-YYYY')
      .optional(),
    filed: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().positive().max(10000).default(1000),
  })
  .refine((data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to), {
    message: 'From date must be before or equal to to date',
    path: ['from'],
  })

export const partyStatementQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export const recordPartyPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(999999999.99),
  paymentMethod: z
    .enum(['CASH', 'UPI', 'CARD', 'NETBANKING', 'CHEQUE', 'CREDIT', 'WALLET'])
    .default('CASH'),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  paymentDate: z.string().datetime({ offset: true }).optional(),
})

export const fileGstPeriodSchema = z.object({
  returnPeriod: z.string().regex(/^\d{2}-\d{4}$/, 'Return period must be MM-YYYY'),
  branchId: z.string().optional(),
})

export const gstSyncSchema = z.object({
  branchId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export type FinanceDateRangeQuery = z.infer<typeof financeDateRangeSchema>
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>
export type CreateLedgerInput = z.infer<typeof createLedgerSchema>
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>
export type PartyLedgerQuery = z.infer<typeof partyLedgerQuerySchema>
export type PartyStatementQuery = z.infer<typeof partyStatementQuerySchema>
export type RecordPartyPaymentInput = z.infer<typeof recordPartyPaymentSchema>
export type GstReportQuery = z.infer<typeof gstReportQuerySchema>
export type FileGstPeriodInput = z.infer<typeof fileGstPeriodSchema>
export type GstSyncInput = z.infer<typeof gstSyncSchema>
