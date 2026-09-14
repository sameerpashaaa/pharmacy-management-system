import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────

export const PurchaseStatusEnum = z.enum([
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'INVOICED',
  'CANCELLED',
])

export const PurchaseReturnStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'DISPATCHED',
  'COMPLETED',
  'CANCELLED',
])

export const SupplierStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLACKLISTED'])

export const ThreeWayMatchStatusEnum = z.enum(['MATCHED', 'MISMATCHED', 'PENDING'])

// ─── Supplier ─────────────────────────────────────────────────

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(120),
  contactPerson: z.string().max(80, 'Contact person cannot exceed 80 characters').optional(),
  phone: z.string().max(20, 'Phone cannot exceed 20 characters').optional(),
  email: z.string().email('Invalid email format').max(120).optional().or(z.literal('')),
  gstin: z.string().max(15, 'GSTIN cannot exceed 15 characters').optional(),
  pan: z.string().max(10, 'PAN cannot exceed 10 characters').optional(),
  dlNumber: z.string().max(30, 'Drug license cannot exceed 30 characters').optional(),
  address: z.string().max(500, 'Address cannot exceed 500 characters').optional(),
  city: z.string().max(50, 'City cannot exceed 50 characters').optional(),
  state: z.string().max(50, 'State cannot exceed 50 characters').optional(),
  pincode: z.string().max(10, 'Pincode cannot exceed 10 characters').optional(),
  bankName: z.string().max(80, 'Bank name cannot exceed 80 characters').optional(),
  bankAccount: z.string().max(30, 'Bank account cannot exceed 30 characters').optional(),
  bankIfsc: z.string().max(11, 'IFSC cannot exceed 11 characters').optional(),
  creditDays: z.coerce.number().int().min(0, 'Credit days cannot be negative').max(365).default(30),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
})

export const updateSupplierSchema = createSupplierSchema.partial()

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: SupplierStatusEnum.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

// ─── Purchase Order ────────────────────────────────────────────

export const purchaseItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  orderedQuantity: z.number().int().positive('Ordered quantity must be positive').max(99999),
  unitCost: z.number().min(0, 'Unit cost cannot be negative').max(999999.99),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().datetime({ offset: true }).optional(),
  manufacturingDate: z.string().datetime({ offset: true }).optional(),
})

export const createPurchaseSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  expectedDate: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  items: z
    .array(purchaseItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items'),
})

export const updatePurchaseSchema = z.object({
  expectedDate: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['DRAFT', 'ORDERED', 'CANCELLED']).optional(),
  supplierId: z.string().optional(),
})

export const purchaseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  supplierId: z.string().optional(),
  status: z
    .enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'CANCELLED'])
    .optional(),
  sortBy: z
    .enum(['purchaseDate', 'purchaseNumber', 'totalAmount', 'status'])
    .default('purchaseDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>

// ─── GRN (Goods Receipt Note) ──────────────────────────────────

export const grnItemSchema = z.object({
  purchaseItemId: z.string().min(1, 'Purchase item is required'),
  receivedQuantity: z.number().int().positive('Received quantity must be positive').max(99999),
  batchNumber: z.string().min(1, 'Batch number is required').max(50),
  expiryDate: z.string().datetime({ offset: true }),
  manufacturingDate: z.string().datetime({ offset: true }).optional(),
  purchasePrice: z.number().min(0, 'Purchase price cannot be negative').max(999999.99),
  mrp: z.number().min(0, 'MRP cannot be negative').max(999999.99),
  coldChainTempLog: z.string().max(500).optional(), // Temperature log for cold chain items
  qualityCheckPassed: z.boolean().default(true),
  qualityCheckNotes: z.string().max(500).optional(),
})

export const createGrnSchema = z.object({
  purchaseId: z.string().min(1, 'Purchase order is required'),
  branchId: z.string().min(1, 'Branch is required'),
  grnNumber: z.string().min(1, 'GRN number is required').max(50),
  grnDate: z.string().datetime({ offset: true }),
  notes: z.string().max(1000).optional(),
  items: z
    .array(grnItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items'),
})

export const grnListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  purchaseId: z.string().optional(),
  sortBy: z.enum(['grnDate', 'grnNumber']).default('grnDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreateGrnInput = z.infer<typeof createGrnSchema>

// ─── Three-Way Matching ────────────────────────────────────────

export const threeWayMatchItemSchema = z.object({
  purchaseItemId: z.string(),
  grnItemId: z.string().optional(),
  invoiceQuantity: z.number().int().positive(),
  invoiceAmount: z.number().min(0),
  tolerancePercent: z.number().min(0).max(100).default(2),
})

export const threeWayMatchSchema = z.object({
  purchaseId: z.string(),
  invoiceId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().datetime({ offset: true }).optional(),
  items: z.array(threeWayMatchItemSchema).min(1),
})

export type ThreeWayMatchInput = z.infer<typeof threeWayMatchSchema>

// ─── Supplier Invoice / Payment ────────────────────────────────

export const supplierInvoiceSchema = z.object({
  purchaseId: z.string().optional(),
  supplierId: z.string().min(1),
  invoiceNumber: z.string().min(1, 'Invoice number is required').max(50),
  invoiceDate: z.string().datetime({ offset: true }),
  dueDate: z.string().datetime({ offset: true }).optional(),
  totalAmount: z.number().min(0),
  taxAmount: z.number().min(0).default(0),
  notes: z.string().max(1000).optional(),
})

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  purchaseId: z.string().optional(),
  invoiceId: z.string().optional(),
  amount: z.number().positive('Payment amount must be positive'),
  paymentDate: z.string().datetime({ offset: true }),
  method: z.enum(['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'WALLET']),
  reference: z.string().max(64).optional(),
  notes: z.string().max(500).optional(),
})

// ─── Purchase Returns ──────────────────────────────────────────

export const purchaseReturnItemSchema = z.object({
  purchaseItemId: z.string().min(1, 'Purchase item is required'),
  quantity: z.number().int().positive('Return quantity must be positive'),
  unitCost: z.number().min(0),
  reason: z.string().min(1, 'Return reason is required').max(500),
  batchId: z.string().optional(),
})

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.string().min(1, 'Purchase order is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  returnNumber: z.string().min(1, 'Return number is required').max(50),
  returnDate: z.string().datetime({ offset: true }),
  reason: z.string().min(1, 'Return reason is required').max(1000),
  notes: z.string().max(1000).optional(),
  items: z.array(purchaseReturnItemSchema).min(1),
})

export const purchaseReturnListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().optional(),
  supplierId: z.string().optional(),
  status: PurchaseReturnStatusEnum.optional(),
  sortBy: z.enum(['returnDate', 'returnNumber']).default('returnDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>
