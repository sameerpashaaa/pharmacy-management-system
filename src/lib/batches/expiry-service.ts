// ─────────────────────────────────────────────────────────────
// Expiry Detection Service
//
// Observational/reporting layer over the existing Batch model.
// It reuses the Batch module's lazy expiry sweep (`expireDueBatches`)
// so expired batches are always represented as `BatchStatus.EXPIRED`
// before any read — there is exactly ONE expiry mechanism.
//
// Classification (documented boundary semantics, spec:
// Batch_Expiry_Tracking.md §3, FAQ, SOPs, Data_Flow_Diagrams L2):
//   daysRemaining = ceil((expiryDate - now) / 1 day)
//   <= 30 days  -> CRITICAL   (inclusive of exactly 30)
//   31..60      -> WARNING    (inclusive of exactly 60)
//   61..90      -> INFO       (inclusive of exactly 90)
//   <= 0 days   -> EXPIRED (not "expiring") — matches the lazy sweep
//   > 90 days   -> outside the window, not shown
//
// "Expired" is a distinct concept from "near-expiry": a batch only
// appears in the expired view when its status is EXPIRED (set by the
// sweep when expiryDate < now), never merely because it is aging.
// Near-expiry alerting (SMS/email/notifications) is NOT part of this
// module — those are future Notification workflows.
// ─────────────────────────────────────────────────────────────
import type { Batch, Prisma, Product } from '@prisma/client'

import { expireDueBatches } from '@/lib/batches/batch-service'
import prisma from '@/lib/db/prisma'

// ─── Constants ───────────────────────────────────────────────

export const EXPIRY_CRITICAL_DAYS = 30
export const EXPIRY_WARNING_DAYS = 60
export const EXPIRY_INFO_DAYS = 90
export const MS_PER_DAY = 24 * 60 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────

export type ExpirySeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface ExpiryListParams {
  page?: number
  limit?: number
  search?: string
  productId?: string
  branchId?: string
  severity?: ExpirySeverity
}

export interface BatchWithProduct extends Batch {
  product: Product
}

export interface ExpiringBatchListItem extends BatchWithProduct {
  availableQuantity: number
  daysRemaining: number
  severity: ExpirySeverity
}

export interface ExpiredBatchListItem extends Omit<BatchWithProduct, 'status'> {
  status: 'EXPIRED'
  availableQuantity: number
  daysPast: number
}

export interface ExpiryListResult<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export interface ExpirySummary {
  critical: number
  warning: number
  info: number
  /** Total expiring (sum of critical + warning + info). */
  expiring: number
  expired: number
}

const productInclude = { product: true } as const

function availableQuantityOf(batch: {
  quantity: number
  reservedQuantity: number
  soldQuantity: number
}): number {
  return batch.quantity - batch.reservedQuantity - batch.soldQuantity
}

function toListItem(batch: BatchWithProduct) {
  return { ...batch, availableQuantity: availableQuantityOf(batch) }
}

// ─── Pure classification (testable, injectable clock) ────────

/**
 * Whole days until expiry, computed against a fixed `now`.
 * Uses ceil so a batch expiring in exactly 30 days reports 30 and a
 * batch 0.5 days away reports 1 — never rounded down to "already
 * expired" prematurely. <= 0 means past/before now.
 */
export function daysUntilExpiryDate(expiryDate: Date, now: Date): number {
  return Math.ceil((expiryDate.getTime() - now.getTime()) / MS_PER_DAY)
}

/**
 * FEFO-style expiry classification against a fixed `now`.
 * Returns null for already-expired batches (<= 0 days) and for
 * batches outside the 90-day window. Boundaries are inclusive:
 * 30 -> CRITICAL, 60 -> WARNING, 90 -> INFO.
 */
export function expirySeverity(expiryDate: Date, now: Date): ExpirySeverity | null {
  const days = daysUntilExpiryDate(expiryDate, now)
  if (days <= 0) return null
  if (days <= EXPIRY_CRITICAL_DAYS) return 'CRITICAL'
  if (days <= EXPIRY_WARNING_DAYS) return 'WARNING'
  if (days <= EXPIRY_INFO_DAYS) return 'INFO'
  return null
}

// ─── Expiring view ───────────────────────────────────────────

/**
 * ACTIVE batches expiring within (now, now + 90 days].
 *
 * A batch must be ACTIVE (never BLOCKED/EXPIRED/DISPOSED/EXHAUSTED),
 * have positive available quantity (zero-availability batches are not
 * "at risk" stock) and a future expiry inside the window. Classification
 * and severity filtering happen in memory against the given `now`;
 * search/product/branch scoping is enforced server side in the query.
 * Ordered earliest-expiry-first, deterministic by batch id.
 */
export async function getExpiringBatches(
  params: ExpiryListParams = {},
  now: Date = new Date()
): Promise<ExpiryListResult<ExpiringBatchListItem>> {
  await expireDueBatches()

  const { page = 1, limit = 20, search, productId, branchId, severity } = params
  const windowEnd = new Date(now.getTime() + EXPIRY_INFO_DAYS * MS_PER_DAY)

  const where: Prisma.BatchWhereInput = {
    status: 'ACTIVE',
    expiryDate: { gt: now, lte: windowEnd },
  }

  if (search) {
    where.OR = [
      { batchNumber: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
    ]
  }
  if (productId) where.productId = productId
  if (branchId) where.branchId = branchId

  const rows = await prisma.batch.findMany({
    where,
    include: productInclude,
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
  })

  const classified = (rows as BatchWithProduct[])
    .map((batch) => ({
      ...toListItem(batch),
      daysRemaining: daysUntilExpiryDate(batch.expiryDate, now),
      severity: expirySeverity(batch.expiryDate, now)!,
    }))
    .filter(
      (batch) => batch.availableQuantity > 0 && (severity ? batch.severity === severity : true)
    )

  const start = (page - 1) * limit

  return {
    data: classified.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: classified.length,
      pages: Math.ceil(classified.length / limit),
    },
  }
}

// ─── Expired view ────────────────────────────────────────────

/**
 * Batches whose status is EXPIRED (kept consistent by the lazy sweep).
 * Sorted earliest-expiry-first (the oldest-expired appears first),
 * deterministic by batch id. Does NOT include DISPOSED/EXHAUSTED —
 * those are handled terminal states, not expired stock.
 */
export async function getExpiredBatches(
  params: ExpiryListParams = {},
  now: Date = new Date()
): Promise<ExpiryListResult<ExpiredBatchListItem>> {
  await expireDueBatches()

  const { page = 1, limit = 20, search, productId, branchId } = params

  const where: Prisma.BatchWhereInput = { status: 'EXPIRED' }

  if (search) {
    where.OR = [
      { batchNumber: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
    ]
  }
  if (productId) where.productId = productId
  if (branchId) where.branchId = branchId

  const [rows, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: productInclude,
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    }),
    prisma.batch.count({ where }),
  ])

  const data = (rows as BatchWithProduct[]).map((batch) => ({
    ...toListItem(batch),
    status: 'EXPIRED' as const,
    daysPast: Math.max(0, Math.floor((now.getTime() - batch.expiryDate.getTime()) / MS_PER_DAY)),
  }))

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}

// ─── Expiry hub summary ──────────────────────────────────────

/**
 * Severity counts for the expiring window plus the count of EXPIRED
 * batches. Same eligibility semantics as `getExpiringBatches`.
 */
export async function getExpirySummary(
  branchId?: string,
  now: Date = new Date()
): Promise<ExpirySummary> {
  await expireDueBatches()

  const windowEnd = new Date(now.getTime() + EXPIRY_INFO_DAYS * MS_PER_DAY)

  const [expiringRows, expired] = await Promise.all([
    prisma.batch.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { gt: now, lte: windowEnd },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        expiryDate: true,
        quantity: true,
        reservedQuantity: true,
        soldQuantity: true,
      },
    }),
    prisma.batch.count({
      where: { status: 'EXPIRED', ...(branchId ? { branchId } : {}) },
    }),
  ])

  let critical = 0
  let warning = 0
  let info = 0
  let expiring = 0

  for (const batch of expiringRows) {
    const available = availableQuantityOf(batch)
    if (available <= 0) continue
    const severity = expirySeverity(batch.expiryDate, now)
    if (!severity) continue
    expiring += 1
    if (severity === 'CRITICAL') critical += 1
    else if (severity === 'WARNING') warning += 1
    else info += 1
  }

  return { critical, warning, info, expiring, expired }
}
