import { z } from 'zod'

export const PrescriptionStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DISPENSED',
  'EXPIRED',
])

export type PrescriptionStatus = z.infer<typeof PrescriptionStatusEnum>

export const prescriptionImageInputSchema = z.object({
  fileUrl: z.string().min(1, 'File URL is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().int().positive('File size must be positive'),
  mimeType: z.string().min(1, 'MIME type is required'),
})

export const createPrescriptionSchema = z.object({
  patientName: z.string().trim().min(1, 'Patient name is required').max(100),
  patientAge: z
    .number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(150, 'Invalid age')
    .optional()
    .nullable(),
  patientPhone: z
    .string()
    .trim()
    .regex(/^[0-9+ -]{7,15}$/, 'Invalid phone number format')
    .optional()
    .nullable()
    .or(z.literal('')),
  doctorName: z.string().trim().max(100).optional().nullable(),
  doctorRegNumber: z.string().trim().max(50).optional().nullable(),
  prescriptionDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
  customerId: z.string().optional().nullable(),
  branchId: z.string().min(1, 'Branch is required'),
  images: z.array(prescriptionImageInputSchema).optional().default([]),
})

export type CreatePrescriptionInput = z.input<typeof createPrescriptionSchema>

export const updatePrescriptionSchema = z.object({
  patientName: z.string().trim().min(1).max(100).optional(),
  patientAge: z.number().int().min(0).max(150).optional().nullable(),
  patientPhone: z.string().trim().optional().nullable(),
  doctorName: z.string().trim().max(100).optional().nullable(),
  doctorRegNumber: z.string().trim().max(50).optional().nullable(),
  prescriptionDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  customerId: z.string().optional().nullable(),
})

export type UpdatePrescriptionInput = z.input<typeof updatePrescriptionSchema>

export const approvePrescriptionSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
})

export type ApprovePrescriptionInput = z.input<typeof approvePrescriptionSchema>

export const rejectPrescriptionSchema = z.object({
  rejectionReason: z.string().trim().min(1, 'Rejection reason is required').max(500),
})

export type RejectPrescriptionInput = z.input<typeof rejectPrescriptionSchema>

export const prescriptionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: PrescriptionStatusEnum.optional(),
  branchId: z.string().optional(),
  customerId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'prescriptionDate', 'patientName']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type PrescriptionQueryParams = z.infer<typeof prescriptionQuerySchema>
