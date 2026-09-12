import { z } from 'zod'

// ─── Drug Schedule Enum ───────────────────────────────────────

export const DrugScheduleEnum = z.enum(['NONE', 'H', 'H1', 'X', 'G', 'J'])

export type DrugSchedule = z.infer<typeof DrugScheduleEnum>

// ─── Barcode Schema ───────────────────────────────────────────

export const barcodeSchema = z.object({
  barcode: z
    .string()
    .min(1, 'Barcode is required')
    .max(50, 'Barcode must be 50 characters or less')
    .regex(/^[0-9A-Za-z\-]+$/, 'Barcode can only contain alphanumeric characters and hyphens'),
  type: z.string().default('EAN13'),
  isPrimary: z.boolean().default(false),
})

export type BarcodeInput = z.infer<typeof barcodeSchema>

// ─── Category Schema ──────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const updateCategorySchema = createCategorySchema.partial()

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

// ─── Product Schema ───────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters').max(200),
  genericName: z.string().max(200).optional(),
  sku: z
    .string()
    .min(2, 'SKU must be at least 2 characters')
    .max(50)
    .regex(/^[A-Z0-9\-]+$/, 'SKU can only contain uppercase letters, numbers, and hyphens'),
  barcode: z
    .string()
    .max(50)
    .regex(/^[0-9A-Za-z\-]*$/, 'Barcode can only contain alphanumeric characters and hyphens')
    .optional()
    .or(z.literal('')),
  description: z.string().max(2000).optional(),
  manufacturer: z.string().max(100).optional(),
  composition: z.string().max(1000).optional(),
  drugSchedule: DrugScheduleEnum.default('NONE'),
  isPrescriptionRequired: z.boolean().default(false),
  unitOfMeasure: z.string().min(1).max(20).default('Strip'),
  tabsPerStrip: z.number().int().positive().optional(),
  packSize: z.string().max(50).optional(),
  hsnCode: z.string().max(20).optional(),
  gstRate: z.number().min(0).max(100).step(0.01).default(12),
  cgstRate: z.number().min(0).max(100).step(0.01).default(6),
  sgstRate: z.number().min(0).max(100).step(0.01).default(6),
  igstRate: z.number().min(0).max(100).step(0.01).default(12),
  isGstExempt: z.boolean().default(false),
  mrp: z.number().min(0).max(999999.99).step(0.01),
  ptr: z.number().min(0).max(999999.99).step(0.01).optional(),
  costPrice: z.number().min(0).max(999999.99).step(0.01).optional(),
  minStockLevel: z.number().int().min(0).default(10),
  maxStockLevel: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).default(20),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  isReturnable: z.boolean().default(true),
  categoryIds: z.array(z.string()).min(1, 'At least one category is required'),
  barcodes: z.array(barcodeSchema).optional(),
})

export const updateProductSchema = createProductSchema.partial().extend({
  categoryIds: z.array(z.string()).optional(),
  barcodes: z.array(barcodeSchema).optional(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>

// ─── CSV Import Schemas ──────────────────────────────────────

// CSV cells arrive as strings. Coerce numeric/boolean cells WITHOUT
// silently mangling invalid values: unparseable input is returned as-is
// so the underlying schema rejects it (e.g. "abc" is never turned into 0).
function toCsvNumber(val: unknown): unknown {
  if (val === null || val === undefined) return undefined
  const s = String(val).trim()
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : val
}

const coerceNumber = (schema: z.ZodNumber) => z.preprocess(toCsvNumber, schema)

// Empty CSV cells on optional numerics act like an unspecified field
// (preprocess maps "" -> undefined, so the inner schema must accept that).
const coerceOptionalNumber = (schema: z.ZodNumber) => z.preprocess(toCsvNumber, schema.optional())

const toCsvBoolean = (val: unknown): unknown => {
  if (val === null || val === undefined) return undefined
  const s = String(val).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1') return true
  if (s === 'false' || s === 'no' || s === '0') return false
  return val
}

const coerceBoolean = z.preprocess(toCsvBoolean, z.boolean())

// Empty cell acts like an unspecified field (so enum defaults apply).
const coerceEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined
    const s = String(val).trim()
    if (s === '') return undefined
    return s.toUpperCase()
  }, z.enum(values))

export const productImportRowSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters').max(200),
  genericName: z.string().max(200).optional(),
  sku: z
    .string()
    .min(2, 'SKU must be at least 2 characters')
    .max(50)
    .regex(/^[A-Z0-9\-]+$/, 'SKU can only contain uppercase letters, numbers, and hyphens'),
  barcode: z
    .string()
    .max(50)
    .regex(/^[0-9A-Za-z\-]*$/, 'Barcode can only contain alphanumeric characters and hyphens')
    .optional()
    .or(z.literal('')),
  description: z.string().max(2000).optional(),
  manufacturer: z.string().max(100).optional(),
  composition: z.string().max(1000).optional(),
  drugSchedule: coerceEnum(['NONE', 'H', 'H1', 'X', 'G', 'J'] as const).default('NONE'),
  isPrescriptionRequired: coerceBoolean.default(false),
  unitOfMeasure: z.string().min(1).max(20).default('Strip'),
  tabsPerStrip: coerceOptionalNumber(z.number().int().positive()),
  packSize: z.string().max(50).optional(),
  hsnCode: z.string().max(20).optional(),
  gstRate: coerceNumber(z.number().min(0).max(100).step(0.01)).default(12),
  cgstRate: coerceNumber(z.number().min(0).max(100).step(0.01)).default(6),
  sgstRate: coerceNumber(z.number().min(0).max(100).step(0.01)).default(6),
  igstRate: coerceNumber(z.number().min(0).max(100).step(0.01)).default(12),
  isGstExempt: coerceBoolean.default(false),
  mrp: coerceNumber(z.number().min(0).max(999999.99).step(0.01)),
  ptr: coerceOptionalNumber(z.number().min(0).max(999999.99).step(0.01)),
  costPrice: coerceOptionalNumber(z.number().min(0).max(999999.99).step(0.01)),
  minStockLevel: coerceNumber(z.number().int().min(0)).default(10),
  maxStockLevel: coerceOptionalNumber(z.number().int().min(0)),
  reorderLevel: coerceNumber(z.number().int().min(0)).default(20),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isActive: coerceBoolean.default(true),
  isReturnable: coerceBoolean.default(true),
  // Semicolon-separated category slugs or names; resolved against the DB.
  categories: z.string().min(1, 'At least one category is required'),
  // Semicolon-separated secondary barcodes (become ProductBarcode rows).
  additionalBarcodes: z.string().optional(),
})

export type ProductImportRow = z.infer<typeof productImportRowSchema>

// ─── Query Parameters ─────────────────────────────────────────

// Parse "true"/"false" query-string booleans correctly
const booleanFromString = z.preprocess((val) => {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}, z.boolean())

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: booleanFromString.optional(),
  sortBy: z.enum(['name', 'sku', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type ProductListQuery = z.infer<typeof productListQuerySchema>

export const categoryListQuerySchema = z.object({
  parentId: z.string().optional(),
  isActive: booleanFromString.optional(),
})

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>
