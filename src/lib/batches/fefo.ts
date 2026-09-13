// ─────────────────────────────────────────────────────────────
// FEFO (First Expiry, First Out) — selection & allocation
//
// Pure domain logic, no database access. FEFO eligibility and
// allocation are kept deterministic so the future POS/dispensing
// layer can consume them inside a transaction.
//
// Core rule (spec: Stock_Management_Module §5, Batch_Expiry_Tracking
// §4, Test_Cases TC-STK-002): for a product, consume the ACTIVE
// batch with the earliest expiry date first. No other ordering
// key (manufacturing date, creation date, cost, quantity) is used.
// Equal expiry dates are broken deterministically by batch id —
// an implementation choice, not a business rule (documented).
//
// Eligibility: only ACTIVE batches with positive available quantity
// and a non-passed expiry date. BLOCKED (quarantined), EXPIRED,
// DISPOSED and EXHAUSTED batches are never selected. A batch is not
// eligible merely because it holds quantity.
//
// CONCURRENCY BOUNDARY: selection does NOT reserve or deduct stock.
// A positive result here is advisory — POS/dispensing MUST re-check
// and mutate quantities transactionally (optimistic CAS), exactly
// like stock adjustments.
// ─────────────────────────────────────────────────────────────

export type BatchStatusValue = 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'DISPOSED' | 'EXHAUSTED'

/**
 * Minimal shape of a batch row required for FEFO eligibility.
 * Production callers pass Prisma batch rows (subtype-compatible);
 * tests pass plain fixtures.
 */
export interface FefoBatchCandidate {
  id: string
  batchNumber: string
  productId: string
  quantity: number
  reservedQuantity: number
  soldQuantity: number
  status: BatchStatusValue
  expiryDate: Date
  branchId: string | null
}

/** A batch that passed the FEFO eligibility filter. */
export interface FefoEligibleBatch {
  batchId: string
  batchNumber: string
  productId: string
  expiryDate: Date
  availableQuantity: number
  branchId: string | null
}

/** One batch slice produced by the allocation. */
export interface FefoAllocation {
  batchId: string
  batchNumber: string
  expiryDate: Date
  allocatedQuantity: number
  availableQuantityBefore: number
  /** Available quantity left in the batch after this slice. */
  remainingQuantity: number
}

export type FefoResult =
  | {
      status: 'success'
      requestedQuantity: number
      allocatedQuantity: number
      allocations: FefoAllocation[]
    }
  | {
      status: 'insufficient'
      requestedQuantity: number
      /** Total allocatable across all eligible batches. */
      allocatedQuantity: number
      /** requestedQuantity - allocatedQuantity. */
      shortfall: number
      /** Partial allocation (what COULD be supplied) — NOT consumable. */
      allocations: FefoAllocation[]
    }
  | {
      status: 'no_stock'
      requestedQuantity: number
      allocatedQuantity: 0
      shortfall: number
      allocations: readonly []
    }

export function availableQuantityOf(batch: FefoBatchCandidate): number {
  return batch.quantity - batch.reservedQuantity - batch.soldQuantity
}

/**
 * FEFO eligibility rule.
 *
 * A batch is eligible for FEFO only when ALL of the following hold:
 * - `status === 'ACTIVE'` (BLOCKED = quarantined, EXPIRED , DISPOSED
 *   and EXHAUSTED are operationally/legally non-consumable);
 * - available quantity > 0 (a zero-availability batch cannot be consumed);
 * - `expiryDate` has not passed (`>= now` — same boundary the batch
 *   module's lazy `expireDueBatches` sweep uses).
 */
export function filterEligibleBatches(
  batches: FefoBatchCandidate[],
  now: Date = new Date()
): FefoEligibleBatch[] {
  return batches
    .filter((b) => b.status === 'ACTIVE' && availableQuantityOf(b) > 0 && b.expiryDate >= now)
    .map((b) => ({
      batchId: b.id,
      batchNumber: b.batchNumber,
      productId: b.productId,
      expiryDate: b.expiryDate,
      availableQuantity: availableQuantityOf(b),
      branchId: b.branchId,
    }))
}

/**
 * FEFO ordering comparator.
 * Primary: earliest expiry date first. Tie-breaker: batch id ascending —
 * deterministic, stable, and not a business rule (documented choice).
 */
export function compareFefoCandidates(a: FefoEligibleBatch, b: FefoEligibleBatch): number {
  return a.expiryDate.getTime() - b.expiryDate.getTime() || a.batchId.localeCompare(b.batchId)
}

/**
 * Allocate a requested quantity across eligible batches using FEFO.
 *
 * Pure: takes already-eligible candidates, returns a structured result.
 * - `success`: requested quantity fully allocated, `allocations` sum to
 *   `requestedQuantity`.
 * - `insufficient`: eligible stock exists but is less than requested.
 *   Returns the partial allocation with a `shortfall` — the caller must
 *   NOT treat it as fulfillable (no silent partial fulfillment).
 * - `no_stock`: no eligible batches (or none with positive availability).
 *
 * Throws on non-positive or non-integer `requestedQuantity`.
 */
export function allocateFefo(
  candidates: FefoEligibleBatch[],
  requestedQuantity: number
): FefoResult {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Requested quantity must be a positive integer')
  }

  const pool = candidates.filter((c) => c.availableQuantity > 0)

  if (pool.length === 0) {
    return {
      status: 'no_stock',
      requestedQuantity,
      allocatedQuantity: 0,
      shortfall: requestedQuantity,
      allocations: [],
    }
  }

  const sorted = [...pool].sort(compareFefoCandidates)

  let remaining = requestedQuantity
  const allocations: FefoAllocation[] = []

  for (const batch of sorted) {
    if (remaining <= 0) break
    const take = Math.min(batch.availableQuantity, remaining)
    allocations.push({
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      allocatedQuantity: take,
      availableQuantityBefore: batch.availableQuantity,
      remainingQuantity: batch.availableQuantity - take,
    })
    remaining -= take
  }

  const allocatedQuantity = requestedQuantity - remaining

  if (remaining > 0) {
    return {
      status: 'insufficient',
      requestedQuantity,
      allocatedQuantity,
      shortfall: remaining,
      allocations,
    }
  }

  return { status: 'success', requestedQuantity, allocatedQuantity, allocations }
}
