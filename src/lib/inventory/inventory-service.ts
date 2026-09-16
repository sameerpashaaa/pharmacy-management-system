// ─────────────────────────────────────────────────────────────
// Inventory Service
// ─────────────────────────────────────────────────────────────
import type { InventoryMovement, Prisma, StockAdjustment } from '@prisma/client'

import { allocateFefo, filterEligibleBatches } from '@/lib/batches/fefo'
import type { FefoBatchCandidate } from '@/lib/batches/fefo'
import prisma from '@/lib/db/prisma'

import type { AuthUser } from './branch-access'
import { assertBranchAccess } from './branch-access'

// ─── Constants ────────────────────────────────────────────────

/**
 * Adjustments with |quantity| <= this value are auto-approved (self-approval).
 * Source: Stock_Management_Module.md §4 "≤ 10 units Pharmacist self-approval".
 */
export const AUTO_APPROVE_THRESHOLD = 10

// ─── Types ────────────────────────────────────────────────────

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'overstock'

export interface InventoryRow {
  id: string
  productId: string
  branchId: string
  totalQuantity: number
  reservedQuantity: number
  availableQuantity: number
  updatedAt: Date
  stockStatus: StockStatus
  product: {
    id: string
    name: string
    sku: string
    unitOfMeasure: string
    reorderLevel: number
    maxStockLevel: number | null
  }
  branch: { id: string; name: string; code: string | null }
}

export interface InventoryListResult {
  data: InventoryRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export interface MovementRow {
  id: string
  inventoryId: string
  type: InventoryMovement['type']
  quantity: number
  quantityBefore: number
  quantityAfter: number
  referenceType: string | null
  referenceId: string | null
  batchId: string | null
  notes: string | null
  createdAt: Date
  inventory: {
    productId: string
    product: { id: string; name: string; sku: string; unitOfMeasure: string }
    branch: { id: string; name: string; code: string | null }
  }
}

export interface AdjustmentRow {
  id: string
  branchId: string
  productId: string
  batchId: string | null
  adjustmentType: StockAdjustment['adjustmentType']
  quantity: number
  reason: string
  notes: string | null
  status: StockAdjustment['status']
  approvedById: string | null
  approvedAt: Date | null
  createdById: string
  createdAt: Date
  product: { id: string; name: string; sku: string }
  branch: { id: string; name: string; code: string | null }
  createdBy: { id: string; name: string }
}

// ─── Helpers ──────────────────────────────────────────────────

function computeStockStatus(
  availableQuantity: number,
  reorderLevel: number,
  maxStockLevel: number | null
): StockStatus {
  if (availableQuantity <= 0) return 'out_of_stock'
  if (availableQuantity <= reorderLevel) return 'low_stock'
  if (maxStockLevel !== null && availableQuantity > maxStockLevel) return 'overstock'
  return 'in_stock'
}

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
  )
}

// ─── Read: Inventory List ─────────────────────────────────────

export async function getInventory(
  params: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    productId?: string
    status?: string
    sortBy?: 'product' | 'totalQuantity' | 'availableQuantity' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
  } = {}
): Promise<InventoryListResult> {
  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    productId,
    status,
    sortBy = 'product',
    sortOrder = 'asc',
  } = params

  const where: Prisma.InventoryWhereInput = {}
  if (branchId) where.branchId = branchId
  if (productId) where.productId = productId
  if (search) {
    where.product = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ],
    }
  }

  let orderBy: Prisma.InventoryOrderByWithRelationInput
  if (sortBy === 'product') orderBy = { product: { name: sortOrder } }
  else if (sortBy === 'totalQuantity') orderBy = { totalQuantity: sortOrder }
  else if (sortBy === 'availableQuantity') orderBy = { availableQuantity: sortOrder }
  else orderBy = { updatedAt: sortOrder }

  const include = {
    product: {
      select: {
        id: true,
        name: true,
        sku: true,
        unitOfMeasure: true,
        reorderLevel: true,
        maxStockLevel: true,
      },
    },
    branch: { select: { id: true, name: true, code: true } },
  }

  if (status && status !== 'all') {
    // In-memory status filter (filters all matches, then paginates).
    const all = await prisma.inventory.findMany({ where, orderBy, include })
    const withStatus: InventoryRow[] = all.map((r) => ({
      ...r,
      stockStatus: computeStockStatus(
        r.availableQuantity,
        r.product.reorderLevel,
        r.product.maxStockLevel
      ),
    }))
    const filtered = withStatus.filter((r) => r.stockStatus === status)
    const start = (page - 1) * limit
    return {
      data: filtered.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: filtered.length,
        pages: Math.ceil(filtered.length / limit),
      },
    }
  }

  const skip = (page - 1) * limit
  const [found, total] = await Promise.all([
    prisma.inventory.findMany({ where, skip, take: limit, orderBy, include }),
    prisma.inventory.count({ where }),
  ])

  const data: InventoryRow[] = found.map((r) => ({
    ...r,
    stockStatus: computeStockStatus(
      r.availableQuantity,
      r.product.reorderLevel,
      r.product.maxStockLevel
    ),
  }))

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}

// ─── Read: Movements ──────────────────────────────────────────

export async function getMovements(
  params: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    productId?: string
    type?: InventoryMovement['type']
  } = {}
): Promise<{
  data: MovementRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const { page = 1, limit = 20, search, branchId, productId, type } = params

  const where: Prisma.InventoryMovementWhereInput = {}
  if (type) where.type = type
  if (branchId || productId || search) {
    where.inventory = {
      branchId: branchId ?? undefined,
      productId: productId ?? undefined,
      product: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    }
  }

  const include = {
    inventory: {
      select: {
        productId: true,
        product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    },
  }

  const skip = (page - 1) * limit
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include,
    }),
    prisma.inventoryMovement.count({ where }),
  ])

  return {
    data: rows as MovementRow[],
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

// ─── Read: Adjustments ────────────────────────────────────────

export async function getAdjustments(
  params: {
    page?: number
    limit?: number
    search?: string
    branchId?: string
    productId?: string
    status?: StockAdjustment['status']
    adjustmentType?: StockAdjustment['adjustmentType']
  } = {}
): Promise<{
  data: AdjustmentRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const { page = 1, limit = 20, search, branchId, productId, status, adjustmentType } = params

  const where: Prisma.StockAdjustmentWhereInput = {}
  if (branchId) where.branchId = branchId
  if (productId) where.productId = productId
  if (status) where.status = status
  if (adjustmentType) where.adjustmentType = adjustmentType
  if (search) {
    // StockAdjustment has no product relation; resolve matching product ids first.
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    where.productId = { in: products.map((p) => p.id) }
  }

  const skip = (page - 1) * limit
  const [rows, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.stockAdjustment.count({ where }),
  ])

  const [products, branches] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true, sku: true },
    }),
    prisma.branch.findMany({
      where: { id: { in: rows.map((r) => r.branchId) } },
      select: { id: true, name: true, code: true },
    }),
  ])
  const productMap = new Map(products.map((p) => [p.id, p]))
  const branchMap = new Map(branches.map((b) => [b.id, b]))

  const data: AdjustmentRow[] = rows.map((r) => ({
    ...r,
    product: productMap.get(r.productId) ?? { id: r.productId, name: 'Unknown product', sku: '' },
    branch: branchMap.get(r.branchId) ?? { id: r.branchId, name: 'Unknown branch', code: null },
  }))

  return {
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

// ─── Batch Reconciliation (internal, transactional) ───────────

/**
 * Reconcile batch quantities for a negative stock adjustment using FEFO.
 * Called within an existing transaction. Reduces batch.quantity for the
 * adjusted product+branch, picking the earliest-expiring batches first.
 *
 * If no eligible batches exist (aggregate-only stock from a prior positive
 * adjustment or direct inventory creation), the function returns silently —
 * the inventory-level movement is still valid.
 *
 * CAS: each batch update uses `where { id, quantity }` to detect concurrent
 * modification, consistent with disposeBatch and POS sale patterns.
 */
async function reconcileBatchesForNegativeAdjustment(
  tx: Prisma.TransactionClient,
  adjustment: StockAdjustment,
  actorId: string
): Promise<void> {
  if (adjustment.quantity >= 0) return

  const targetQty = Math.abs(adjustment.quantity)

  // Fetch eligible batches (ACTIVE, not expired, with availability) in FEFO order
  const batchRows = await tx.batch.findMany({
    where: {
      productId: adjustment.productId,
      branchId: adjustment.branchId,
      status: 'ACTIVE',
      expiryDate: { gte: new Date() },
    },
    select: {
      id: true,
      batchNumber: true,
      productId: true,
      quantity: true,
      reservedQuantity: true,
      soldQuantity: true,
      status: true,
      expiryDate: true,
      branchId: true,
    },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
  })

  const eligible = filterEligibleBatches(batchRows as FefoBatchCandidate[])
  const totalAvailable = eligible.reduce((sum, b) => sum + b.availableQuantity, 0)

  // No eligible batches — aggregate-only stock, nothing to reconcile
  if (eligible.length === 0 || totalAvailable === 0) return

  if (targetQty > totalAvailable) {
    throw new Error(
      `Conflict: requested adjustment of ${targetQty} exceeds batch availability of ${totalAvailable} — possible diverged inventory`
    )
  }

  const allocation = allocateFefo(eligible, targetQty)
  if (allocation.status !== 'success') {
    throw new Error('Conflict: FEFO allocation failed during batch reconciliation')
  }

  for (const a of allocation.allocations) {
    const batchRow = batchRows.find((b) => b.id === a.batchId)
    if (!batchRow) {
      throw new Error('Conflict: batch changed concurrently during allocation')
    }

    const nextQuantity = batchRow.quantity - a.allocatedQuantity

    // CAS: update batch quantity
    const result = await tx.batch.updateMany({
      where: {
        id: batchRow.id,
        quantity: batchRow.quantity,
      },
      data: { quantity: nextQuantity },
    })
    if (result.count !== 1) {
      throw new Error('Conflict: batch changed concurrently, please retry')
    }

    // If batch is now fully depleted, mark DISPOSED with status log
    if (nextQuantity === 0) {
      const disposeResult = await tx.batch.updateMany({
        where: { id: batchRow.id, quantity: 0, status: 'ACTIVE' },
        data: { status: 'DISPOSED' },
      })
      if (disposeResult.count !== 1) {
        throw new Error('Conflict: batch state changed concurrently during disposal')
      }

      await tx.batchStatusLog.create({
        data: {
          batchId: batchRow.id,
          fromStatus: 'ACTIVE',
          toStatus: 'DISPOSED',
          reason: `Stock adjustment (${adjustment.adjustmentType}): ${adjustment.reason}`,
          changedById: actorId,
        },
      })
    }
  }
}

// ─── Stock Apply (internal, transactional) ────────────────────

/**
 * Applies a stock adjustment to the inventory record and records the movement.
 *
 * Concurrency: runs inside an interactive transaction. Inventory updates use an
 * optimistic compare-and-set guarded by `updatedAt` (`updateMany ... where id
 * AND updatedAt`). Under Postgres this serializes concurrent writers (the row
 * lock + re-evaluated predicate makes the loser match 0 rows). A lost race is
 * surfaced as a 409 so the user can review and retry. The adjustment row is
 * guarded by `status = PENDING` so double-approval cannot double-apply.
 *
 * Quantity invariant: `availableQuantity = totalQuantity - reservedQuantity`.
 * A stock adjustment changes total and available by the SAME signed delta and
 * never touches `reservedQuantity`, so the invariant holds after every write.
 */
async function applyStockAdjustment(
  tx: Prisma.TransactionClient,
  adjustment: StockAdjustment,
  actorId: string
): Promise<void> {
  const qty = adjustment.quantity
  const invWhere: Prisma.InventoryWhereUniqueInput = {
    productId_branchId: { productId: adjustment.productId, branchId: adjustment.branchId },
  }

  const inventory = await tx.inventory.findUnique({ where: invWhere })
  const beforeTotal = inventory?.totalQuantity ?? 0
  const beforeAvailable = inventory?.availableQuantity ?? 0

  if (qty < 0 && beforeAvailable < Math.abs(qty)) {
    throw new Error(`Insufficient available stock: available ${beforeAvailable}`)
  }

  const afterTotal = beforeTotal + qty
  const afterAvailable = beforeAvailable + qty

  let inventoryId: string
  if (inventory) {
    const res = await tx.inventory.updateMany({
      where: { id: inventory.id, updatedAt: inventory.updatedAt },
      data: { totalQuantity: afterTotal, availableQuantity: afterAvailable },
    })
    if (res.count !== 1) {
      throw new Error('Conflict: inventory changed concurrently, please retry')
    }
    inventoryId = inventory.id
  } else {
    const created = await tx.inventory.create({
      data: {
        productId: adjustment.productId,
        branchId: adjustment.branchId,
        totalQuantity: afterTotal,
        availableQuantity: afterAvailable,
        reservedQuantity: 0,
      },
    })
    inventoryId = created.id
  }

  await tx.inventoryMovement.create({
    data: {
      inventoryId,
      type: 'ADJUSTMENT',
      quantity: qty,
      quantityBefore: beforeTotal,
      quantityAfter: afterTotal,
      referenceType: 'ADJUSTMENT',
      referenceId: adjustment.id,
      batchId: adjustment.batchId ?? null,
      notes: [adjustment.reason, adjustment.notes].filter(Boolean).join(' — ') || null,
      createdById: actorId,
    },
  })

  // Reconcile batch quantities for negative adjustments (FEFO)
  await reconcileBatchesForNegativeAdjustment(tx, adjustment, actorId)

  const adjRes = await tx.stockAdjustment.updateMany({
    where: { id: adjustment.id, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
  })
  if (adjRes.count !== 1) {
    throw new Error('Conflict: adjustment already processed')
  }
}

// ─── Create Adjustment ────────────────────────────────────────

const adjustmentSelect = {
  id: true,
  branchId: true,
  productId: true,
  batchId: true,
  adjustmentType: true,
  quantity: true,
  reason: true,
  notes: true,
  status: true,
  approvedById: true,
  approvedAt: true,
  createdById: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const

export interface AdjustmentSummary {
  id: string
  branchId: string
  productId: string
  batchId: string | null
  adjustmentType: StockAdjustment['adjustmentType']
  quantity: number
  reason: string
  notes: string | null
  status: StockAdjustment['status']
  approvedById: string | null
  approvedAt: Date | null
  createdById: string
  createdAt: Date
  createdBy: { id: string; name: string } | null
}

export type CreateAdjustmentInput = {
  branchId: string
  productId: string
  batchId?: string
  adjustmentType: StockAdjustment['adjustmentType']
  quantity: number
  reason: string
  notes?: string
}

export async function createAdjustment(
  data: CreateAdjustmentInput,
  user: AuthUser
): Promise<AdjustmentSummary> {
  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: { id: true, isActive: true },
  })
  if (!product) throw new Error('Not Found: product')
  if (!product.isActive) throw new Error('Product is inactive')

  // Pre-check availability for reductions
  if (data.quantity < 0) {
    const inv = await prisma.inventory.findUnique({
      where: {
        productId_branchId: { productId: data.productId, branchId: data.branchId },
      },
      select: { availableQuantity: true },
    })
    const available = inv?.availableQuantity ?? 0
    if (available < Math.abs(data.quantity)) {
      throw new Error(`Insufficient available stock: available ${available}`)
    }
  }

  const autoApprove = Math.abs(data.quantity) <= AUTO_APPROVE_THRESHOLD

  if (autoApprove) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const adjustment = await tx.stockAdjustment.create({
          data: {
            branchId: data.branchId,
            productId: data.productId,
            batchId: data.batchId ?? null,
            adjustmentType: data.adjustmentType,
            quantity: data.quantity,
            reason: data.reason,
            notes: data.notes ?? null,
            status: 'PENDING',
            createdById: user.id,
          },
        })
        await applyStockAdjustment(tx, adjustment, user.id)
        return tx.stockAdjustment.findUniqueOrThrow({
          where: { id: adjustment.id },
          select: adjustmentSelect,
        })
      })
      return result
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new Error('Conflict: inventory record already exists for this product/branch')
      }
      throw e
    }
  }

  // Pending adjustment (requires supervisor approval)
  const adjustment = await prisma.stockAdjustment.create({
    data: {
      branchId: data.branchId,
      productId: data.productId,
      batchId: data.batchId ?? null,
      adjustmentType: data.adjustmentType,
      quantity: data.quantity,
      reason: data.reason,
      notes: data.notes ?? null,
      status: 'PENDING',
      createdById: user.id,
    },
    select: adjustmentSelect,
  })

  return adjustment
}

// ─── Approve Adjustment ───────────────────────────────────────

export async function approveAdjustment(
  adjustmentId: string,
  user: AuthUser
): Promise<AdjustmentSummary> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.findUnique({ where: { id: adjustmentId } })
      if (!adjustment) throw new Error('Not Found: adjustment')
      await assertBranchAccess(user, adjustment.branchId)
      if (adjustment.status !== 'PENDING') {
        throw new Error(`Conflict: adjustment is ${adjustment.status.toLowerCase()}, not pending`)
      }
      await applyStockAdjustment(tx, adjustment, user.id)
      return tx.stockAdjustment.findUniqueOrThrow({
        where: { id: adjustmentId },
        select: adjustmentSelect,
      })
    })
    return result
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new Error('Conflict: inventory record already exists for this product/branch')
    }
    throw e
  }
}

// ─── Reject Adjustment ────────────────────────────────────────

export async function rejectAdjustment(
  adjustmentId: string,
  user: AuthUser
): Promise<AdjustmentSummary> {
  const result = await prisma.$transaction(async (tx) => {
    const adjustment = await tx.stockAdjustment.findUnique({ where: { id: adjustmentId } })
    if (!adjustment) throw new Error('Not Found: adjustment')
    await assertBranchAccess(user, adjustment.branchId)
    if (adjustment.status !== 'PENDING') {
      throw new Error(`Conflict: adjustment is ${adjustment.status.toLowerCase()}, not pending`)
    }
    await tx.stockAdjustment.updateMany({
      where: { id: adjustmentId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    })
    return tx.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      select: adjustmentSelect,
    })
  })
  return result
}
