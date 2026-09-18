// ─────────────────────────────────────────────────────────────
// Narcotic Register Service — Opening Balance
// ─────────────────────────────────────────────────────────────
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'

export interface OpeningBalanceInput {
  branchId: string
  productId: string
  quantity: number
  reason: string
  batchNumber: string
  expiryDate: Date
  manufacturingDate?: Date | null
  purchasePrice: number
  mrp: number
  supplierRef?: string
  evidenceFileId?: string
}

export interface OpeningBalanceActor {
  id: string
  branchId: string | null
  permissions?: string[]
}

export async function createOpeningBalance(
  input: OpeningBalanceInput,
  actor: OpeningBalanceActor
): Promise<{ openingBalanceId: string; narcoticRegisterId: string }> {
  // ─── Authorization ───────────────────────────────────────────────
  const permissions = actor.permissions ?? []
  if (!permissions.includes(PERMISSIONS.INVENTORY_ADJUST)) {
    throw new Error('Forbidden: requires permission inventory:adjust')
  }

  if (!actor.branchId) {
    throw new Error('Forbidden: actor must have a branch')
  }
  if (actor.branchId !== input.branchId) {
    throw new Error('Forbidden: branch mismatch')
  }

  await assertBranchAccess(actor, input.branchId)

  // ─── Validation ──────────────────────────────────────────────────
  if (input.quantity <= 0) {
    throw new Error('Opening quantity must be positive')
  }

  if (!input.batchNumber || !input.expiryDate) {
    throw new Error('Batch metadata (batchNumber, expiryDate) is required')
  }

  if (input.purchasePrice < 0) {
    throw new Error('Purchase price cannot be negative')
  }

  if (input.mrp <= 0) {
    throw new Error('MRP must be positive')
  }

  // ─── Check product/branch ───────────────────────────────────────
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, isActive: true, drugSchedule: true },
  })
  if (!product) throw new Error('Not Found: product')
  if (!product.isActive) throw new Error('Product is inactive')
  if (product.drugSchedule !== 'NARCOTIC_NDPS') {
    throw new Error('Opening balance only permitted for NARCOTIC_NDPS products')
  }

  // ─── Uniqueness check (service-level for clear error) ────────────
  const existingOpening = await prisma.narcoticRegister.findFirst({
    where: {
      branchId: input.branchId,
      productId: input.productId,
      movementType: 'OPENING_BALANCE',
    },
    select: { id: true },
  })
  if (existingOpening) {
    throw new Error('Opening balance already exists for this product at this branch')
  }

  // ─── Fetch previous register balance ────────────────────────────
  const prevRegister = await prisma.narcoticRegister.findFirst({
    where: {
      branchId: input.branchId,
      productId: input.productId,
    },
    orderBy: { entryDate: 'desc' },
    select: { balanceQuantity: true },
  })
  const prevBalance = prevRegister?.balanceQuantity ?? 0

  const openingId = `OB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // ─── Atomic Transaction ──────────────────────────────────────────
  let narcoticRegisterId: string
  await prisma.$transaction(
    async (tx) => {
      // 1. Create the opening Batch
      const batch = await tx.batch.create({
        data: {
          productId: input.productId,
          batchNumber: input.batchNumber,
          manufacturingDate: input.manufacturingDate ?? null,
          expiryDate: input.expiryDate,
          purchasePrice: input.purchasePrice,
          mrp: input.mrp,
          quantity: input.quantity,
          status: 'ACTIVE',
          branchId: input.branchId,
        },
      })

      // 2. Update/create Inventory
      await tx.inventory.upsert({
        where: {
          productId_branchId: {
            productId: input.productId,
            branchId: input.branchId,
          },
        },
        update: {
          totalQuantity: { increment: input.quantity },
          availableQuantity: { increment: input.quantity },
        },
        create: {
          productId: input.productId,
          branchId: input.branchId,
          totalQuantity: input.quantity,
          availableQuantity: input.quantity,
          reservedQuantity: 0,
        },
      })

      // 3. InventoryMovement
      const inv = await tx.inventory.findUniqueOrThrow({
        where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      })
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inv.id,
          type: 'IN',
          quantity: input.quantity,
          quantityBefore: inv.availableQuantity - input.quantity,
          quantityAfter: inv.availableQuantity,
          referenceType: 'OPENING_BALANCE',
          referenceId: openingId,
          batchId: batch.id,
          notes: `Narcotic opening balance: ${input.reason}`,
          createdById: actor.id,
        },
      })

      // 4. NarcoticRegister
      const narcoticRegister = await tx.narcoticRegister.create({
        data: {
          branchId: input.branchId,
          productId: input.productId,
          batchId: batch.id,
          movementType: 'OPENING_BALANCE',
          quantityIn: input.quantity,
          quantityOut: 0,
          balanceQuantity: prevBalance + input.quantity,
          referenceType: 'OPENING_BALANCE',
          referenceId: openingId,
          enteredById: actor.id,
        },
      })
      narcoticRegisterId = narcoticRegister.id

      // 5. AuditLog
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NARCOTIC_OPENING_BALANCE_CREATE',
          entity: 'NarcoticRegister',
          entityId: narcoticRegister.id,
          metadata: {
            openingId,
            productId: input.productId,
            quantity: input.quantity,
            reason: input.reason,
            batchId: batch.id,
            batchNumber: input.batchNumber,
            expiryDate: input.expiryDate.toISOString(),
            manufacturingDate: input.manufacturingDate?.toISOString() ?? null,
            purchasePrice: input.purchasePrice,
            mrp: input.mrp,
            warning: prevBalance > 0 ? 'POST_DATED_OPENING' : undefined,
          },
        },
      })
    },
    { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }
  )

  return { openingBalanceId: openingId, narcoticRegisterId: narcoticRegisterId! }
}
