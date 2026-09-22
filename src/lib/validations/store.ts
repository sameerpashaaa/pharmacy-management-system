import { WallType } from '@prisma/client'
import { z } from 'zod'

// --- Wall Schemas ---
export const wallSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  code: z.string().min(1, 'Code is required').max(10, 'Code too long'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  wallType: z.nativeEnum(WallType).default('OPEN'),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
})

export type WallInput = z.infer<typeof wallSchema>

// --- Rack Schemas ---
export const rackSchema = z.object({
  wallId: z.string().min(1, 'Wall is required'),
  code: z.string().min(1, 'Code is required').max(20, 'Code too long'),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  capacity: z.coerce.number().int().min(1).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
})

export type RackInput = z.infer<typeof rackSchema>

// --- Shelf Schemas ---
export const rackShelfSchema = z.object({
  rackId: z.string().min(1, 'Rack is required'),
  level: z.coerce.number().int().min(1, 'Level must be at least 1'),
  label: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  maxBins: z.coerce.number().int().min(1).default(10),
  isActive: z.boolean().default(true),
})

export type RackShelfInput = z.infer<typeof rackShelfSchema>

// --- Bin Schemas ---
export const storeBinSchema = z.object({
  shelfId: z.string().min(1, 'Shelf is required'),
  binCode: z.string().min(1, 'Bin code is required').max(10, 'Code too long'),
  capacity: z.coerce.number().int().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
})

export type StoreBinInput = z.infer<typeof storeBinSchema>

// --- Assign Stock Schemas ---
export const assignStockSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  batchId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
})

export type AssignStockInput = z.infer<typeof assignStockSchema>

// --- Locate Query Schema ---
export const storeLocateQuerySchema = z.object({
  q: z.string().optional(),
  branchId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type StoreLocateQuery = z.infer<typeof storeLocateQuerySchema>
