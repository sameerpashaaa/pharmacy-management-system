// ─────────────────────────────────────────────────────────────
// FEFO Service — database-backed batch selection
//
// Reusable selection logic for POS/dispensing (Phase 3). Throws on
// invalid input; otherwise returns the pure `allocateFefo` result.
//
// Concurrency boundary: this service only READS batches. It does not
// reserve, deduct, or consume stock. Future consumption (POS) must run
// inside a transaction with optimistic CAS on the target batch rows —
// same pattern as `stock_adjustments` approval.
// ─────────────────────────────────────────────────────────────
import { expireDueBatches } from '@/lib/batches/batch-service'
import type { FefoResult } from '@/lib/batches/fefo'
import { allocateFefo, filterEligibleBatches, type FefoBatchCandidate } from '@/lib/batches/fefo'
import prisma from '@/lib/db/prisma'

export interface SelectFefoBatchesOptions {
  /** Restrict selection to a specific branch's batches. */
  branchId?: string
}

export function assertPositiveIntegerQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Requested quantity must be a positive integer')
  }
}

export function assertProductIdentifier(productId: string): void {
  if (!productId || productId.trim().length === 0) {
    throw new Error('Product identifier is required')
  }
}

/**
 * Select the FEFO allocation for a product.
 *
 * Steps:
 * 1. Run the lazy expiry sweep so due ACTIVE/BLOCKED batches are
 *    recorded as EXPIRED (keeps batch status consistent with reads).
 * 2. Query only this product's ACTIVE, unexpired batches.
 * 3. Apply the pure eligibility filter + FEFO allocation.
 *
 * Returns `success`, `insufficient` or `no_stock` — never a silent
 * partial fulfillment.
 */
export async function selectFefoBatches(
  productId: string,
  requestedQuantity: number,
  options: SelectFefoBatchesOptions = {}
): Promise<FefoResult> {
  assertProductIdentifier(productId)
  assertPositiveIntegerQuantity(requestedQuantity)

  await expireDueBatches()

  const rows = await prisma.batch.findMany({
    where: {
      productId,
      status: 'ACTIVE',
      expiryDate: { gte: new Date() },
      ...(options.branchId ? { branchId: options.branchId } : {}),
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

  const candidates = filterEligibleBatches(rows as FefoBatchCandidate[])

  return allocateFefo(candidates, requestedQuantity)
}
