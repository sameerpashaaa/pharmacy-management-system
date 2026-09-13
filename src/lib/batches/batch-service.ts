// ─────────────────────────────────────────────────────────────
// Batch Management Service
//
// Lifecycle: ACTIVE → BLOCKED (block action) | ACTIVE/BLOCKED/EXPIRED
// → DISPOSED (dispose action). Lazy sweep flips ACTIVE/BLOCKED batches
// whose expiry date has passed into EXPIRED on read. EXHAUSTED is
// reached programmatically by downstream consumption (future POS).
//
// Batch creation is owned by Purchases/GRN (out of scope); `createBatch`
// is exposed here for that future flow and for tests.
// ─────────────────────────────────────────────────────────────
import type {
  Batch,
  BatchDisposal,
  BatchStatus,
  BatchStatusLog,
  Prisma,
  Product,
} from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess, type AuthUser } from '@/lib/inventory/branch-access'
import type { CreateBatchInput, DisposeBatchInput, UpdateBatchInput } from '@/lib/validations/batch'

// ─── Types ────────────────────────────────────────────────────

export interface BatchWithProduct extends Batch {
  product: Product
}

export interface BatchDetail extends BatchWithProduct {
  statusLogs: BatchStatusLog[]
  disposals: BatchDisposal[]
}

export interface BatchListItem extends BatchWithProduct {
  availableQuantity: number
}

export interface BatchDetailItem extends BatchDetail {
  availableQuantity: number
}

export interface BatchListParams {
  page?: number
  limit?: number
  search?: string
  productId?: string
  branchId?: string
  status?: BatchStatus
  sortBy?: 'expiryDate' | 'batchNumber' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface BatchListResult {
  data: BatchListItem[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

const productInclude = { product: true } as const

const detailInclude = {
  product: true,
  statusLogs: { orderBy: { createdAt: 'desc' } },
  disposals: { orderBy: { createdAt: 'desc' } },
} as const

function toListItem(batch: BatchWithProduct): BatchListItem {
  return {
    ...batch,
    availableQuantity: batch.quantity - batch.reservedQuantity - batch.soldQuantity,
  }
}

function toDetailItem(batch: BatchDetail): BatchDetailItem {
  return {
    ...batch,
    availableQuantity: batch.quantity - batch.reservedQuantity - batch.soldQuantity,
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
  )
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

// ─── Lazy Expiry Sweep ────────────────────────────────────────

/**
 * Flip every ACTIVE/BLOCKED batch whose expiry date has passed into
 * EXPIRED. Called lazily from list/detail reads — no cron/worker.
 */
export async function expireDueBatches(): Promise<number> {
  const due = await prisma.batch.findMany({
    where: { expiryDate: { lt: new Date() }, status: { in: ['ACTIVE', 'BLOCKED'] } },
    select: { id: true, status: true },
  })

  if (due.length === 0) return 0

  await prisma.$transaction(
    due.flatMap((b) => [
      prisma.batch.updateMany({
        where: { id: b.id, status: b.status },
        data: { status: 'EXPIRED' },
      }),
      prisma.batchStatusLog.create({
        data: {
          batchId: b.id,
          fromStatus: b.status,
          toStatus: 'EXPIRED',
          reason: 'Batch expired',
          changedById: null,
        },
      }),
    ])
  )

  return due.length
}

// ─── Read ─────────────────────────────────────────────────────

export async function getBatches(params: BatchListParams = {}): Promise<BatchListResult> {
  await expireDueBatches()

  const {
    page = 1,
    limit = 20,
    search,
    productId,
    branchId,
    status,
    sortBy = 'expiryDate',
    sortOrder = 'asc',
  } = params

  const skip = (page - 1) * limit

  const where: Prisma.BatchWhereInput = {}

  if (search) {
    where.OR = [
      { batchNumber: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
    ]
  }

  if (productId) where.productId = productId
  if (branchId) where.branchId = branchId
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder } as Prisma.BatchOrderByWithRelationInput,
      include: productInclude,
    }),
    prisma.batch.count({ where }),
  ])

  return {
    data: (data as BatchWithProduct[]).map(toListItem),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

export async function getBatchById(id: string): Promise<BatchDetailItem | null> {
  await expireDueBatches()

  const batch = await prisma.batch.findUnique({ where: { id }, include: detailInclude })
  return batch ? toDetailItem(batch as BatchDetail) : null
}

// ─── Create (used by future GRN/Purchases + tests) ────────────

export async function createBatch(
  input: CreateBatchInput,
  user: AuthUser
): Promise<BatchDetailItem> {
  try {
    const batch = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true, isActive: true },
      })
      if (!product) throw new Error('Not Found: product')
      if (!product.isActive) throw new Error('Product is inactive')

      if (input.branchId) await assertBranchAccess(user, input.branchId)

      const existing = await tx.batch.findFirst({
        where: { productId: input.productId, batchNumber: input.batchNumber },
        select: { id: true },
      })
      if (existing) {
        throw new Error('Conflict: a batch with this batch number already exists for the product')
      }

      const created = await tx.batch.create({
        data: {
          product: { connect: { id: input.productId } },
          batchNumber: input.batchNumber,
          manufacturingDate: input.manufacturingDate ?? null,
          expiryDate: input.expiryDate,
          purchasePrice: input.purchasePrice ?? 0,
          mrp: input.mrp ?? 0,
          quantity: input.quantity ?? 0,
          supplierRef: input.supplierRef ?? null,
          purchase: input.purchaseId ? { connect: { id: input.purchaseId } } : undefined,
          branchId: input.branchId ?? null,
        },
        include: detailInclude,
      })

      await tx.batchStatusLog.create({
        data: {
          batchId: created.id,
          fromStatus: 'ACTIVE',
          toStatus: 'ACTIVE',
          reason: 'Batch created',
          changedById: user.id,
        },
      })

      return created
    })

    return toDetailItem(batch as BatchDetail)
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new Error('Conflict: a batch with this batch number already exists for the product')
    }
    throw e
  }
}

// ─── Update (non-lifecycle fields, ACTIVE only) ──────────────

export async function updateBatch(
  id: string,
  input: UpdateBatchInput,
  user: AuthUser
): Promise<BatchDetailItem> {
  const batch = await prisma.$transaction(async (tx) => {
    const existing = await tx.batch.findUnique({
      where: { id },
      select: { id: true, status: true, branchId: true },
    })
    if (!existing) throw new Error('Not Found: batch')
    if (existing.branchId) await assertBranchAccess(user, existing.branchId)
    if (existing.status !== 'ACTIVE') {
      throw new Error(
        `Conflict: batch is ${existing.status.toLowerCase()}, only ACTIVE batches can be edited`
      )
    }

    const updates = omitUndefined({
      batchNumber: input.batchNumber,
      manufacturingDate: input.manufacturingDate,
      expiryDate: input.expiryDate,
      purchasePrice: input.purchasePrice,
      mrp: input.mrp,
      supplierRef: input.supplierRef,
    }) as Prisma.BatchUpdateManyMutationInput
    if (Object.keys(updates).length === 0) throw new Error('No updates provided')

    const result = await tx.batch.updateMany({
      where: { id, status: 'ACTIVE' },
      data: updates,
    })
    if (result.count === 0) throw new Error('Conflict: batch state changed, please retry')

    return tx.batch.findUniqueOrThrow({ where: { id }, include: detailInclude })
  })

  return toDetailItem(batch as BatchDetail)
}

// ─── Block ────────────────────────────────────────────────────

export async function blockBatch(
  id: string,
  reason: string,
  user: AuthUser
): Promise<BatchDetailItem> {
  const batch = await prisma.$transaction(async (tx) => {
    const existing = await tx.batch.findUnique({
      where: { id },
      select: { status: true, branchId: true },
    })
    if (!existing) throw new Error('Not Found: batch')
    if (existing.branchId) await assertBranchAccess(user, existing.branchId)
    if (existing.status !== 'ACTIVE') {
      throw new Error(
        `Conflict: batch is ${existing.status.toLowerCase()}, only ACTIVE batches can be blocked`
      )
    }

    const result = await tx.batch.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'BLOCKED', blockedReason: reason },
    })
    if (result.count === 0) throw new Error('Conflict: batch state changed, please retry')

    await tx.batchStatusLog.create({
      data: {
        batchId: id,
        fromStatus: 'ACTIVE',
        toStatus: 'BLOCKED',
        reason,
        changedById: user.id,
      },
    })

    return tx.batch.findUniqueOrThrow({ where: { id }, include: detailInclude })
  })

  return toDetailItem(batch as BatchDetail)
}

// ─── Dispose ──────────────────────────────────────────────────

export async function disposeBatch(
  id: string,
  input: DisposeBatchInput,
  user: AuthUser
): Promise<BatchDetailItem> {
  const batch = await prisma.$transaction(async (tx) => {
    const existing = await tx.batch.findUnique({
      where: { id },
      select: {
        status: true,
        branchId: true,
        quantity: true,
        reservedQuantity: true,
        soldQuantity: true,
      },
    })
    if (!existing) throw new Error('Not Found: batch')
    if (existing.branchId) await assertBranchAccess(user, existing.branchId)
    if (existing.status === 'DISPOSED' || existing.status === 'EXHAUSTED') {
      throw new Error(`Conflict: batch is ${existing.status.toLowerCase()}, cannot dispose`)
    }

    const available = existing.quantity - existing.reservedQuantity - existing.soldQuantity
    if (input.quantity > available) {
      throw new Error(`Insufficient available quantity: available ${available}`)
    }

    await tx.batchDisposal.create({
      data: {
        batchId: id,
        quantity: input.quantity,
        reason: input.reason,
        notes: input.notes ?? null,
        disposedById: user.id,
      },
    })

    const nextQuantity = existing.quantity - input.quantity

    if (nextQuantity === 0) {
      const result = await tx.batch.updateMany({
        where: { id, status: existing.status, quantity: existing.quantity },
        data: { status: 'DISPOSED', quantity: 0 },
      })
      if (result.count === 0) throw new Error('Conflict: batch state changed, please retry')

      await tx.batchStatusLog.create({
        data: {
          batchId: id,
          fromStatus: existing.status,
          toStatus: 'DISPOSED',
          reason: `Disposed (${existing.status.toLowerCase()}): ${input.notes ?? 'batch fully disposed'}`,
          changedById: user.id,
        },
      })
    } else {
      const result = await tx.batch.updateMany({
        where: { id, status: existing.status, quantity: existing.quantity },
        data: { quantity: nextQuantity },
      })
      if (result.count === 0) throw new Error('Conflict: batch state changed, please retry')
    }

    return tx.batch.findUniqueOrThrow({ where: { id }, include: detailInclude })
  })

  return toDetailItem(batch as BatchDetail)
}
