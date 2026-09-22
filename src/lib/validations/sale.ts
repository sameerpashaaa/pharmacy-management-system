import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────

export const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'UPI',
  'NETBANKING',
  'CHEQUE',
  'CREDIT',
  'WALLET',
])

export const SaleStatusEnum = z.enum([
  'COMPLETED',
  'CANCELLED',
  'PARTIALLY_RETURNED',
  'FULLY_RETURNED',
])

export const PaymentStatusEnum = z.enum(['PAID', 'PARTIAL', 'CREDIT', 'OVERPAID'])

// ─── POS Items & Payments ─────────────────────────────────────

/**
 * A cart line references a product by EXACTLY ONE identifier:
 * productId, barcode or sku. Quantity must be a positive integer.
 *
 * Note: no price/discount-amount fields — money is always
 * derived server-side (see sales-service.ts).
 */
export const posItemSchema = z
  .object({
    productId: z.string().optional(),
    barcode: z.string().optional(),
    sku: z.string().optional(),
    quantity: z
      .number()
      .int('Quantity must be a whole number')
      .min(1, 'Quantity must be at least 1')
      .max(99999, 'Quantity cannot exceed 99999'),
    looseUnits: z
      .number()
      .int('Loose units must be a whole number')
      .min(0, 'Loose units cannot be negative')
      .max(99999, 'Loose units cannot exceed 99999')
      .optional(),
    discountPercent: z
      .number()
      .min(0, 'Discount cannot be negative')
      .max(100, 'Discount cannot exceed 100%')
      .default(0),
    // B2B wholesale: pin this line to a specific batch instead of FEFO.
    batchId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    const identifiers = [val.productId, val.barcode, val.sku].filter(
      (x) => x !== undefined && x !== ''
    )
    if (identifiers.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Provide exactly one of productId, barcode or sku',
      })
    }
  })

export const posPaymentSchema = z.object({
  method: PaymentMethodEnum,
  amount: z.number().positive('Payment amount must be greater than zero').max(999999999),
  reference: z.string().max(64, 'Reference cannot exceed 64 characters').optional(),
})

export const createSaleSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  items: z
    .array(posItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items'),
  payments: z
    .array(posPaymentSchema)
    .min(1, 'At least one payment is required')
    .max(20, 'Cannot exceed 20 payments'),
  customerId: z.string().optional(),
  // Minimal POS customer capture — accepted only for credit sales.
  customer: z
    .object({
      name: z.string().min(1, 'Customer name is required').max(120),
      phone: z.string().max(20, 'Phone cannot exceed 20 characters').optional(),
    })
    .optional(),
  prescriptionId: z.string().optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  h1Capture: z
    .object({
      patientName: z.string().min(1, 'Patient name is required').max(120),
      patientAddress: z.string().max(250).default(''),
      patientPhone: z.string().max(20).optional(),
      doctorName: z.string().min(1, 'Doctor name is required').max(120),
      doctorRegNo: z.string().min(1, 'Doctor registration number is required').max(80),
    })
    .optional(),
})

export type CreateSaleInput = z.infer<typeof createSaleSchema>

// ─── Query Schemas ────────────────────────────────────────────

export const saleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  status: SaleStatusEnum.optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  sortBy: z.enum(['saleDate', 'invoiceNumber', 'totalAmount']).default('saleDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const posProductsQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

// ─── Held Bills ───────────────────────────────────────────────

export const createHeldBillSchema = z.object({
  label: z.string().max(80, 'Label cannot exceed 80 characters').optional(),
  cartData: z.record(z.unknown()).or(z.array(z.unknown())),
  customerId: z.string().optional(),
})

export type CreateHeldBillInput = z.infer<typeof createHeldBillSchema>

export const heldBillListQuerySchema = z.object({
  branchId: z.string().optional(),
})

export const posConfigQuerySchema = z.object({
  branchId: z.string().optional(),
})
