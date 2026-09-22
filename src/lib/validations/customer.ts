// ─────────────────────────────────────────────────────────────
// Validations — Customer
// ─────────────────────────────────────────────────────────────
import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()

const numericStringToNumber = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return undefined
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : v
  }
  return v
}, z.number().nonnegative().optional())

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  phone: optionalText(20),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('Enter a valid email').optional()
  ),
  gstin: optionalText(20),
  address: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: optionalText(10),
  creditLimit: numericStringToNumber,
  creditDays: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(365).optional()
  ),
  customerType: z.enum(['RETAIL', 'WHOLESALE']).optional().default('RETAIL'),
  notes: optionalText(500),
  isActive: z.boolean().optional().default(true),
})

export const updateCustomerSchema = createCustomerSchema.partial()

export const customerListQuerySchema = z.object({
  page: z
    .preprocess((v) => (v === '' || v === undefined ? '1' : v), z.coerce.number().int().min(1))
    .optional()
    .default(1),
  limit: z
    .preprocess(
      (v) => (v === '' || v === undefined ? '20' : v),
      z.coerce.number().int().min(1).max(100)
    )
    .optional()
    .default(20),
  search: z.string().trim().optional(),
  active: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean().optional()
  ),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>
