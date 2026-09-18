import { z } from 'zod'

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('Invalid email format').max(100).optional().nullable().or(z.literal('')),
  gstin: z.string().max(15).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(50).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  pincode: z.string().max(10).optional().nullable(),
  creditLimit: z.number().min(0).default(0),
  creditDays: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
})

export type CustomerFormValues = z.infer<typeof customerSchema>

export const customerListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
})

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>
