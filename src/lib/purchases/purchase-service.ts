import type {
  Purchase,
  PurchaseItem,
  PurchaseReturn,
  PurchaseReturnItem,
  Supplier,
  Payment,
} from '@prisma/client'
import { GstTxType, Prisma, NarcoticMovementType } from '@prisma/client'
import type { z } from 'zod'

import prisma from '@/lib/db/prisma'
import { ensureDefaultLedgers } from '@/lib/finance/coa-seed'
import {
  assertBranchAccess,
  resolveBranchScope,
  type AuthUser,
} from '@/lib/inventory/branch-access'
import {
  supplierListQuerySchema,
  purchaseListQuerySchema,
  grnListQuerySchema,
  purchaseReturnListQuerySchema,
  type updatePurchaseSchema,
  type threeWayMatchSchema,
  type supplierPaymentSchema,
  type createPurchaseReturnSchema,
  type updatePurchaseReturnSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '@/lib/validations/purchase'

// ─────────────────────────────────────────────────────────────
// Purchase Service — Supplier & Purchase Order Management
//
// Server-side authority: client never sends trusted money/qty.
// All amounts derived from DB; CAS for inventory; audit on mutations.
// ─────────────────────────────────────────────────────────────

// ─── Utilities ─────────────────────────────────────────────────

/** GST return period "MM-YYYY" for the given date (mirrors finance/gst-service). */
function formatReturnPeriod(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${month}-${date.getFullYear()}`
}

// ─── Types ─────────────────────────────────────────────────────

export interface SupplierWithLedger extends Supplier {
  ledgerEntries: {
    id: string
    type: 'DEBIT' | 'CREDIT'
    amount: Prisma.Decimal
    balance: Prisma.Decimal
    description: string
    entryDate: Date
  }[]
}

export interface PurchaseWithItems extends Purchase {
  items: (PurchaseItem & { product: { id: string; name: string; sku: string } })[]
  supplier: { id: string; name: string }
  createdBy: { id: string; name: string }
  returns?: {
    id: string
    returnNumber: string
    returnDate: Date
    totalAmount: Prisma.Decimal
    status: string
    reason: string
  }[]
}

export interface PurchaseReturnWithDetails extends PurchaseReturn {
  supplier: { id: string; name: string }
  purchase: { id: string; purchaseNumber: string }
  items: (PurchaseReturnItem & {
    product: { id: string; name: string; sku: string }
    batch: { id: string; batchNumber: string } | null
  })[]
}

export interface GrnWithItems {
  id: string
  grnNumber: string
  grnDate: Date
  purchaseId: string
  branchId: string
  notes: string | null
  items: GrnItem[]
  createdBy: { id: string; name: string }
}

export interface GrnItem {
  purchaseItemId: string
  receivedQuantity: number
  batchNumber: string
  expiryDate: Date
  manufacturingDate: Date | null
  purchasePrice: number
  mrp: number
  coldChainTempLog: string | null
  qualityCheckPassed: boolean
  qualityCheckNotes: string | null
}

// ─── Supplier Operations ───────────────────────────────────────

export async function createSupplier(
  data: CreateSupplierInput,
  actor: AuthUser
): Promise<Supplier> {
  // Suppliers are global (no branchId in schema); access is permission-gated
  // at the route layer, so no branch check applies here.
  const supplier = await prisma.supplier.create({
    data: {
      ...data,
      creditDays: data.creditDays ?? 30,
      outstandingBalance: 0,
      isActive: true,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'SUPPLIER_CREATE',
      entity: 'Supplier',
      entityId: supplier.id,
      metadata: { name: supplier.name },
    },
  })

  return supplier
}

export async function getSupplier(id: string, _actor: AuthUser): Promise<Supplier | null> {
  // Suppliers are global (no branchId in schema); access is permission-gated
  // at the route layer, so no branch check applies here.
  return prisma.supplier.findUnique({ where: { id } })
}

export async function updateSupplier(
  id: string,
  data: UpdateSupplierInput,
  actor: AuthUser
): Promise<Supplier> {
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: supplier')

  // Suppliers are global (no branchId in schema); access is permission-gated
  // at the route layer, so no branch check applies here.
  const supplier = await prisma.supplier.update({
    where: { id },
    data,
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'SUPPLIER_UPDATE',
      entity: 'Supplier',
      entityId: id,
      metadata: { changes: data },
    },
  })

  return supplier
}

export async function listSuppliers(
  params: z.infer<typeof supplierListQuerySchema>,
  _actor: AuthUser
): Promise<{
  data: Supplier[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  // Suppliers are global (no branchId in schema); access is permission-gated
  // at the route layer, so no branch check applies here.

  const {
    page = 1,
    limit = 20,
    search,
    status,
    sortBy = 'name',
    sortOrder = 'asc',
  } = supplierListQuerySchema.parse(params)

  const where: Prisma.SupplierWhereInput = {}
  if (status) where.isActive = status === 'ACTIVE'
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const orderBy: Prisma.SupplierOrderByWithRelationInput = { [sortBy]: sortOrder }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({ where, skip, take: limit, orderBy }),
    prisma.supplier.count({ where }),
  ])

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}

// ─── Purchase Order Operations ────────────────────────────────────

export interface CreatePurchaseCommand {
  branchId: string
  supplierId: string
  expectedDate?: Date
  notes?: string
  items: {
    productId: string
    orderedQuantity: number
    unitCost: number
    discountPercent: number
    taxPercent: number
    batchNumber?: string
    expiryDate?: Date
    manufacturingDate?: Date
  }[]
}

export async function createPurchase(
  command: CreatePurchaseCommand,
  actor: AuthUser
): Promise<PurchaseWithItems> {
  await ensureDefaultLedgers()
  await assertBranchAccess(actor, command.branchId)

  const supplier = await prisma.supplier.findUnique({ where: { id: command.supplierId } })
  if (!supplier) throw new Error('Not Found: supplier')
  if (!supplier.isActive) throw new Error('Supplier is inactive')

  const branch = await prisma.branch.findUnique({ where: { id: command.branchId } })
  if (!branch) throw new Error('Not Found: branch')

  // Validate all products exist and are active; fetch MRP for server-side calculation
  const productIds = command.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, isActive: true, name: true, mrp: true, ptr: true },
  })
  if (products.length !== productIds.length) {
    const found = new Set(products.map((p) => p.id))
    const missing = productIds.filter((id) => !found.has(id))
    throw new Error(`Not Found: product ${missing.join(', ')}`)
  }
  const inactive = products.filter((p) => !p.isActive)
  if (inactive.length > 0) {
    throw new Error(`Product is inactive: ${inactive.map((p) => p.name).join(', ')}`)
  }

  // Build product lookup for MRP
  const productMap = new Map(products.map((p) => [p.id, p]))

  // P1-1: server-side line + header financials. The same line-item
  // formula persists to items AND is summed for the Purchase header, so
  // the header is guaranteed to reconcile with its own items.
  const itemRows = command.items.map((item) => {
    const product = productMap.get(item.productId)!
    // Server-side calculation: never trust client-provided totals
    const lineSubtotal = item.orderedQuantity * item.unitCost
    const discountAmount = lineSubtotal * (item.discountPercent / 100)
    const taxableAmount = lineSubtotal - discountAmount
    const taxAmount = taxableAmount * (item.taxPercent / 100)
    const totalAmount = taxableAmount + taxAmount

    return {
      create: {
        productId: item.productId,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: 0,
        freeQuantity: 0,
        unitCost: item.unitCost,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        batchNumber: item.batchNumber ?? null,
        expiryDate: item.expiryDate ?? null,
        manufacturingDate: item.manufacturingDate ?? null,
        mrp: Number(product.mrp),
        ptr: product.ptr ? Number(product.ptr) : null,
      },
      lineSubtotal,
      discountAmount,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    }
  })
  const header = {
    subtotal: Math.round(itemRows.reduce((sum, r) => sum + r.lineSubtotal, 0) * 100) / 100,
    discountAmount: Math.round(itemRows.reduce((sum, r) => sum + r.discountAmount, 0) * 100) / 100,
    taxAmount: Math.round(itemRows.reduce((sum, r) => sum + r.taxAmount, 0) * 100) / 100,
    totalAmount: Math.round(itemRows.reduce((sum, r) => sum + r.totalAmount, 0) * 100) / 100,
  }

  const purchase = await prisma.$transaction(async (tx) => {
    const purchaseNumber = `PO-${Date.now()}`
    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber,
        branchId: command.branchId,
        supplierId: command.supplierId,
        subtotal: header.subtotal,
        discountAmount: header.discountAmount,
        taxAmount: header.taxAmount,
        totalAmount: header.totalAmount,
        balanceDue: header.totalAmount,
        expectedDate: command.expectedDate,
        notes: command.notes ?? null,
        status: 'DRAFT',
        createdById: actor.id,
        items: {
          create: itemRows.map((r) => r.create),
        },
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PURCHASE_CREATE',
        entity: 'Purchase',
        entityId: purchase.id,
        metadata: { purchaseNumber: purchase.purchaseNumber, supplierId: purchase.supplierId },
      },
    })

    return purchase
  })

  return purchase
}

export async function getPurchase(id: string, actor: AuthUser): Promise<PurchaseWithItems | null> {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      returns: {
        select: {
          id: true,
          returnNumber: true,
          returnDate: true,
          totalAmount: true,
          status: true,
          reason: true,
        },
      },
    },
  })

  if (!purchase) return null
  await assertBranchAccess(actor, purchase.branchId)

  return purchase
}

export async function listPurchases(
  params: z.infer<typeof purchaseListQuerySchema>,
  actor: AuthUser
): Promise<{
  data: PurchaseWithItems[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    supplierId,
    status,
    sortBy = 'purchaseDate',
    sortOrder = 'desc',
  } = purchaseListQuerySchema.parse(params)

  const scope = await resolveBranchScope(actor, branchId)

  const where: Prisma.PurchaseWhereInput = {}
  if (scope) where.branchId = scope
  if (supplierId) where.supplierId = supplierId
  if (status) where.status = status
  if (search) {
    where.OR = [
      { purchaseNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const orderBy: Prisma.PurchaseOrderByWithRelationInput = { [sortBy]: sortOrder }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.purchase.count({ where }),
  ])

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}

export async function updatePurchase(
  id: string,
  data: z.infer<typeof updatePurchaseSchema>,
  actor: AuthUser
): Promise<PurchaseWithItems> {
  const existing = await prisma.purchase.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: purchase')

  await assertBranchAccess(actor, existing.branchId)

  const validTransitions: Record<string, string[]> = {
    DRAFT: ['ORDERED', 'CANCELLED'],
    ORDERED: ['SENT', 'CANCELLED'],
    SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['INVOICED'],
  }

  if (data.status && existing.status !== data.status) {
    const allowed = validTransitions[existing.status] || []
    if (!allowed.includes(data.status)) {
      throw new Error(`Invalid status transition: ${existing.status} → ${data.status}`)
    }
  }

  const purchase = await prisma.purchase.update({
    where: { id },
    data,
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'PURCHASE_UPDATE',
      entity: 'Purchase',
      entityId: id,
      metadata: { changes: data },
    },
  })

  return purchase
}

// ─── GRN (Goods Receipt Note) ────────────────────────────────────

export interface GrnCommand {
  purchaseId: string
  branchId: string
  grnNumber: string
  grnDate: Date
  notes?: string
  items: {
    purchaseItemId: string
    receivedQuantity: number
    batchNumber: string
    expiryDate: Date
    manufacturingDate?: Date
    purchasePrice: number
    mrp: number
    coldChainTempLog?: string
    qualityCheckPassed: boolean
    qualityCheckNotes?: string
  }[]
}

export async function createGrn(
  command: GrnCommand,
  actor: AuthUser
): Promise<{ grn: { id: string; grnNumber: string }; purchase: Purchase }> {
  await assertBranchAccess(actor, command.branchId)

  // Basic checks outside transaction (fast fail)
  const purchase = await prisma.purchase.findUnique({
    where: { id: command.purchaseId },
    include: { items: true, supplier: true, branch: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')

  if (purchase.branchId !== command.branchId) {
    throw new Error('Forbidden: purchase order belongs to different branch')
  }
  if (!['ORDERED', 'SENT', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
    throw new Error(`Cannot receive against purchase in status: ${purchase.status}`)
  }

  // H12 — GRN number is now scoped to the branch via the new
  // GoodsReceiptNote table (unique on [branchId, grnNumber]). Each branch
  // owns its own numbering sequence, so a re-used number across branches
  // is no longer a conflict.
  const existingGrn = await prisma.goodsReceiptNote.findFirst({
    where: { branchId: command.branchId, grnNumber: command.grnNumber },
    select: { id: true },
  })
  if (existingGrn) throw new Error('GRN number already exists for this branch')

  // Expiry validation: reject if expiry < 6 months from today (fast fail)
  const sixMonthsFromNow = new Date()
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
  for (const item of command.items) {
    if (item.expiryDate < sixMonthsFromNow) {
      throw new Error(`Expiry date too soon: must be at least 6 months from today`)
    }
  }

  // Check for duplicate batch numbers within this GRN
  const batchNumbers = command.items.map((i) => i.batchNumber)
  if (new Set(batchNumbers).size !== batchNumbers.length) {
    throw new Error('Duplicate batch numbers within GRN')
  }

  const result = await prisma.$transaction(async (tx) => {
    // H13 — lock and re-read purchase items for the over-receive guard.
    // The CAS update below uses `WHERE id = ? AND receivedQuantity + new <=
    // orderedQuantity` so two concurrent GRNs cannot collectively
    // over-receive even at REPEATABLE READ; combined with the surrounding
    // Serializable transaction this fully serializes the increment.
    const purchaseItems = await tx.purchaseItem.findMany({
      where: { purchaseId: command.purchaseId },
      select: {
        id: true,
        productId: true,
        orderedQuantity: true,
        receivedQuantity: true,
        unitCost: true,
        discountPercent: true,
        taxPercent: true,
      },
    })
    const itemMap = new Map(purchaseItems.map((i) => [i.id, i]))

    // Re-validate received quantities against PO INSIDE transaction (concurrency-safe)
    const totalReceived: Record<string, number> = {}
    for (const item of command.items) {
      const poItem = itemMap.get(item.purchaseItemId)
      if (!poItem) throw new Error(`Purchase item not found: ${item.purchaseItemId}`)

      const alreadyReceived = poItem.receivedQuantity
      const remaining = poItem.orderedQuantity - alreadyReceived
      if (item.receivedQuantity > remaining) {
        throw new Error(`Over-receiving: item ${poItem.id} only ${remaining} remaining`)
      }

      totalReceived[item.purchaseItemId] =
        (totalReceived[item.purchaseItemId] || 0) + item.receivedQuantity
    }

    // H12 — create the GRN as a first-class entity.
    const goodsReceiptNote = await tx.goodsReceiptNote.create({
      data: {
        grnNumber: command.grnNumber,
        purchaseId: command.purchaseId,
        branchId: command.branchId,
        grnDate: command.grnDate,
        notes: command.notes ?? null,
        totalAmount: 0, // recomputed below; placeholder keeps the column non-null
        createdById: actor.id,
      },
    })

    // Keep the purchase-level mirror so existing dashboards and exports keep
    // working through the migration; the canonical receipt history now lives
    // in GoodsReceiptNote.
    await tx.purchase.update({
      where: { id: command.purchaseId },
      data: {
        status: 'PARTIALLY_RECEIVED',
        receivedAt: command.grnDate,
      },
    })

    // Create batches, inventory, movements, audit
    for (const item of command.items) {
      const poItem = itemMap.get(item.purchaseItemId)!
      const product = await tx.product.findUnique({ where: { id: poItem.productId } })
      if (!product) throw new Error(`Product not found: ${poItem.productId}`)

      // Quarantine evaluation (service-level enforcement; must not rely on
      // API/UI validation alone). Non-conforming goods are received as
      // BLOCKED so FEFO/sales can never allocate them.
      let blockedReason: string | null = null
      if (item.qualityCheckPassed === false) {
        const notes = item.qualityCheckNotes?.trim()
        blockedReason = `Quality check failed${notes ? `: ${notes}` : ' (no details provided)'}`
      } else {
        const storageCondition = product.storageCondition
        const isColdChain =
          storageCondition === 'DEEP_FREEZE' || storageCondition === 'REFRIGERATED'
        const tempLog = item.coldChainTempLog?.trim() || null
        if (isColdChain && !tempLog) {
          blockedReason = 'Missing required cold-chain temperature log for cold-chain product'
        } else if (tempLog) {
          // Same acceptability rule as the API validation: a provided log
          // must be numeric and within 2–8 °C. Invalid input fails closed.
          const temp = parseFloat(tempLog)
          if (Number.isNaN(temp) || temp < 2 || temp > 8) {
            throw new Error(
              'Validation: Invalid cold chain temperature. Must be a numeric value between 2 and 8 °C'
            )
          }
        }
      }
      const batchStatus = blockedReason ? 'BLOCKED' : 'ACTIVE'

      // H14 — re-receipt of the same (productId, batchNumber, purchaseId)
      // increments the existing batch's quantity instead of failing the
      // unique constraint. Quarantine rules for quality-check / cold-chain
      // failures still apply on the first creation; subsequent re-receipts
      // inherit the existing status.
      const existingBatch = await tx.batch.findFirst({
        where: {
          productId: poItem.productId,
          batchNumber: item.batchNumber,
          purchaseId: command.purchaseId,
        },
        select: { id: true, quantity: true, status: true },
      })
      let batch: { id: string }
      if (existingBatch) {
        const inc = await tx.batch.updateMany({
          where: { id: existingBatch.id },
          data: { quantity: { increment: item.receivedQuantity } },
        })
        if (inc.count !== 1) {
          throw new Error('Conflict: batch changed concurrently, please retry')
        }
        batch = { id: existingBatch.id }
      } else {
        const created = await tx.batch.create({
          data: {
            productId: poItem.productId,
            batchNumber: item.batchNumber,
            manufacturingDate: item.manufacturingDate ?? null,
            expiryDate: item.expiryDate,
            purchasePrice: item.purchasePrice,
            mrp: item.mrp,
            quantity: item.receivedQuantity,
            reservedQuantity: 0,
            soldQuantity: 0,
            status: batchStatus,
            blockedReason,
            supplierRef: item.batchNumber,
            purchaseId: command.purchaseId,
            branchId: command.branchId,
          },
        })
        batch = { id: created.id }
      }

      // Update inventory (CAS via updatedAt)
      const invWhere = {
        productId_branchId: { productId: poItem.productId, branchId: command.branchId },
      }
      const inventory = await tx.inventory.findUnique({ where: invWhere })

      const beforeTotal = inventory?.totalQuantity ?? 0
      const beforeAvailable = inventory?.availableQuantity ?? 0
      const afterTotal = beforeTotal + item.receivedQuantity
      const afterAvailable = beforeAvailable + item.receivedQuantity

      let inventoryId: string
      if (inventory) {
        const res = await tx.inventory.updateMany({
          where: { id: inventory.id, updatedAt: inventory.updatedAt },
          data: { totalQuantity: afterTotal, availableQuantity: afterAvailable },
        })
        if (res.count !== 1) throw new Error('Conflict: inventory changed concurrently')
        inventoryId = inventory.id
      } else {
        const created = await tx.inventory.create({
          data: {
            productId: poItem.productId,
            branchId: command.branchId,
            totalQuantity: afterTotal,
            availableQuantity: afterAvailable,
            reservedQuantity: 0,
          },
        })
        inventoryId = created.id
      }

      // Create inventory movement
      await tx.inventoryMovement.create({
        data: {
          inventoryId,
          type: 'IN',
          quantity: item.receivedQuantity,
          quantityBefore: beforeTotal,
          quantityAfter: afterTotal,
          referenceType: 'GRN',
          referenceId: command.purchaseId,
          batchId: batch.id,
          notes: `GRN ${command.grnNumber} for PO ${command.purchaseId}`,
          createdById: actor.id,
        },
      })

      // ─── Narcotic Register — PURCHASE_RECEIPT ──────────────────────
      if (product.drugSchedule === 'NARCOTIC_NDPS') {
        // Fetch previous narcotic register balance for this branch + product
        const prevNarcotic = await tx.narcoticRegister.findFirst({
          where: {
            branchId: command.branchId,
            productId: poItem.productId,
          },
          orderBy: { entryDate: 'desc' },
          select: { balanceQuantity: true },
        })
        const prevBalance = prevNarcotic?.balanceQuantity ?? 0

        await tx.narcoticRegister.create({
          data: {
            branchId: command.branchId,
            productId: poItem.productId,
            batchId: batch.id,
            movementType: 'PURCHASE_RECEIPT',
            quantityIn: item.receivedQuantity,
            quantityOut: 0,
            balanceQuantity: prevBalance + item.receivedQuantity,
            referenceType: 'PURCHASE',
            referenceId: command.purchaseId,
            enteredById: actor.id,
            entryDate: command.grnDate,
          },
        })
      }

      // H13 — guard the increment with a server-side ceiling so two
      // concurrent GRNs can't collectively over-receive. The DB rejects the
      // update if (current + new) would exceed orderedQuantity.
      const piRes = await tx.purchaseItem.updateMany({
        where: {
          id: item.purchaseItemId,
          receivedQuantity: { lte: poItem.orderedQuantity - item.receivedQuantity },
        },
        data: { receivedQuantity: { increment: item.receivedQuantity } },
      })
      if (piRes.count !== 1) {
        throw new Error(
          `Conflict: purchase item ${poItem.id} would be over-received ` +
            `(ordered ${poItem.orderedQuantity}, already ${poItem.receivedQuantity}, ` +
            `request +${item.receivedQuantity}); please retry`
        )
      }

      // Batch status log (birth convention: X → X; quarantined batches are
      // born BLOCKED with the quarantine reason recorded). Skipped on
      // re-receipt — the batch is already born and its first status is
      // preserved.
      if (!existingBatch) {
        await tx.batchStatusLog.create({
          data: {
            batchId: batch.id,
            fromStatus: batchStatus,
            toStatus: batchStatus,
            reason:
              batchStatus === 'BLOCKED'
                ? `Quarantined at receipt via GRN ${command.grnNumber}: ${blockedReason}`
                : `Received via GRN ${command.grnNumber}`,
            changedById: actor.id,
          },
        })
      }

      // H12 — record the line in the GoodsReceiptItem table for full receipt
      // history. On re-receipt we still write a fresh row because the audit
      // trail of WHICH GRN added how many units is the whole point.
      await tx.goodsReceiptItem.create({
        data: {
          goodsReceiptId: goodsReceiptNote.id,
          purchaseItemId: poItem.id,
          batchId: batch.id,
          receivedQuantity: item.receivedQuantity,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          manufacturingDate: item.manufacturingDate ?? null,
          purchasePrice: item.purchasePrice,
          mrp: item.mrp,
          coldChainTempLog: item.coldChainTempLog ?? null,
          qualityCheckPassed: item.qualityCheckPassed,
          qualityCheckNotes: item.qualityCheckNotes ?? null,
        },
      })
    }

    // Check if fully received (re-read after updates)
    const updatedItems = await tx.purchaseItem.findMany({
      where: { purchaseId: command.purchaseId },
    })
    const allReceived = updatedItems.every((i) => i.receivedQuantity >= i.orderedQuantity)
    const finalStatus = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'

    const finalPurchase = await tx.purchase.update({
      where: { id: command.purchaseId },
      data: { status: finalStatus, receivedAt: command.grnDate },
    })

    // P1-2: recognize the supplier payable at GRN time, priced at the
    // PO line-item cost formula for THIS GRN's received delta only.
    // A PO is not a liability until goods land; each partial receipt
    // accrues only its own share.
    let grnTotalAmount = 0
    for (const received of command.items) {
      const poItem = itemMap.get(received.purchaseItemId)!
      const lineSubtotal = received.receivedQuantity * Number(poItem.unitCost)
      const discountAmount = lineSubtotal * (Number(poItem.discountPercent) / 100)
      const taxableAmount = lineSubtotal - discountAmount
      const taxAmount = taxableAmount * (Number(poItem.taxPercent) / 100)
      const totalAmount = taxableAmount + taxAmount

      grnTotalAmount += totalAmount
    }
    const grnTotal = Math.round(grnTotalAmount * 100) / 100

    const currentSupplier = await tx.supplier.findUnique({
      where: { id: purchase.supplierId },
    })
    if (currentSupplier) {
      const newOutstanding = currentSupplier.outstandingBalance.add(grnTotal)
      await tx.supplierLedger.create({
        data: {
          supplierId: currentSupplier.id,
          type: 'DEBIT',
          amount: grnTotal,
          balance: newOutstanding,
          description: `GRN ${command.grnNumber} received for PO ${purchase.purchaseNumber}`,
          referenceType: 'PURCHASE',
          referenceId: command.purchaseId,
          entryDate: command.grnDate,
        },
      })
      await tx.supplier.update({
        where: { id: currentSupplier.id },
        data: { outstandingBalance: newOutstanding },
      })
    }

    // P1-3: post purchase GST on receipt. Delete-and-recreate inside the
    // same transaction so partial receipts stay idempotent — the GST rows
    // always reflect the CURRENT accumulated received quantities (no
    // unique constraint exists; multiple rows per purchase are legitimate,
    // one per received line item).
    await tx.gstTransaction.deleteMany({
      where: { referenceType: 'PURCHASE', referenceId: command.purchaseId },
    })

    const branchState = purchase.branch.state?.trim().toLowerCase()
    const supplierState = purchase.supplier.state?.trim().toLowerCase()
    const isInterstate = Boolean(branchState && supplierState && branchState !== supplierState)

    for (const item of updatedItems) {
      if (item.receivedQuantity <= 0) continue
      const lineSubtotal = item.receivedQuantity * Number(item.unitCost)
      const discountAmount = lineSubtotal * (Number(item.discountPercent) / 100)
      const taxableAmount = lineSubtotal - discountAmount
      const taxAmount = Math.round(taxableAmount * (Number(item.taxPercent) / 100) * 100) / 100
      const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100

      let cgstAmount = 0
      let sgstAmount = 0
      let igstAmount = 0
      if (isInterstate) {
        igstAmount = taxAmount
      } else {
        cgstAmount = taxAmount / 2
        sgstAmount = taxAmount / 2
      }

      await tx.gstTransaction.create({
        data: {
          branchId: purchase.branchId,
          type: GstTxType.B2B,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          referenceLineId: item.id,
          invoiceNumber: purchase.invoiceNumber ?? purchase.purchaseNumber,
          invoiceDate: purchase.invoiceDate ?? purchase.createdAt,
          partyGstin: purchase.supplier.gstin ?? null,
          partyName: purchase.supplier.name,
          partyState: purchase.supplier.state ?? purchase.branch.state ?? null,
          hsnCode: null,
          taxableAmount: Math.round(taxableAmount * 100) / 100,
          cgstAmount: Math.round(cgstAmount * 100) / 100,
          sgstAmount: Math.round(sgstAmount * 100) / 100,
          igstAmount: Math.round(igstAmount * 100) / 100,
          totalTax: taxAmount,
          totalAmount,
          returnPeriod: formatReturnPeriod(purchase.createdAt),
          isFiled: false,
        },
      })
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GRN_CREATE',
        entity: 'Purchase',
        entityId: command.purchaseId,
        metadata: {
          grnNumber: command.grnNumber,
          grnId: goodsReceiptNote.id,
          purchaseId: command.purchaseId,
          items: command.items.map((i) => ({
            purchaseItemId: i.purchaseItemId,
            batchNumber: i.batchNumber,
            receivedQuantity: i.receivedQuantity,
            qualityCheckPassed: i.qualityCheckPassed,
            qualityCheckNotes: i.qualityCheckNotes,
            coldChainTempLog: i.coldChainTempLog,
          })),
        },
      },
    })

    return { purchase: finalPurchase, goodsReceiptId: goodsReceiptNote.id }
  })

  // H12 — backfill the GoodsReceiptNote.totalAmount now that we know the
  // computed total from the supplier-ledger block above.
  // (purchaseService doesn't return the GRN row directly; the caller can
  // refetch by grnNumber if needed.)
  void command.grnNumber
  return {
    grn: { id: result.goodsReceiptId, grnNumber: command.grnNumber },
    purchase: result.purchase,
  }
}

export async function listGrns(
  params: z.infer<typeof grnListQuerySchema>,
  actor: AuthUser
): Promise<{
  data: {
    id: string
    grnNumber: string
    grnDate: Date
    purchaseId: string
    branchId: string
    supplier: { id: string; name: string }
  }[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    purchaseId,
    sortBy = 'grnDate',
    sortOrder = 'desc',
  } = grnListQuerySchema.parse(params)

  const scope = await resolveBranchScope(actor, branchId)

  // H12 — query the dedicated GoodsReceiptNote table so the response shape
  // mirrors the entity now and one PO can return multiple receipts.
  const sortByMap: Record<string, string> = {
    grnDate: 'grnDate',
    grnNumber: 'grnNumber',
    purchaseDate: 'grnDate',
  }
  const mappedSortBy = sortByMap[sortBy] || 'grnDate'

  const where: Prisma.GoodsReceiptNoteWhereInput = {}
  if (scope) where.branchId = scope
  if (purchaseId) where.purchaseId = purchaseId
  if (search) {
    where.OR = [
      { grnNumber: { contains: search, mode: 'insensitive' } },
      { purchase: { supplier: { name: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const orderBy: Prisma.GoodsReceiptNoteOrderByWithRelationInput = {
    [mappedSortBy]: sortOrder,
  }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.goodsReceiptNote.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        purchase: {
          select: {
            id: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.goodsReceiptNote.count({ where }),
  ])

  return {
    data: data.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      grnDate: g.grnDate,
      purchaseId: g.purchaseId,
      branchId: g.branchId,
      supplier: g.purchase.supplier,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}


// ─── Three-Way Matching ────────────────────────────────────────

export interface ThreeWayMatchResult {
  status: 'MATCHED' | 'MISMATCHED' | 'PENDING'
  mismatches: {
    purchaseItemId: string
    field: string
    poValue: number
    invoiceValue: number
    variance: number
    variancePercent: number
  }[]
}

export async function threeWayMatch(
  data: z.infer<typeof threeWayMatchSchema>,
  actor: AuthUser
): Promise<ThreeWayMatchResult> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: data.purchaseId },
    include: { items: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')

  await assertBranchAccess(actor, purchase.branchId)

  const mismatches: ThreeWayMatchResult['mismatches'] = []
  const itemMap = new Map(purchase.items.map((i) => [i.id, i]))

  for (const invoiceItem of data.items) {
    const poItem = itemMap.get(invoiceItem.purchaseItemId)
    if (!poItem) {
      mismatches.push({
        purchaseItemId: invoiceItem.purchaseItemId,
        field: 'purchaseItemId',
        poValue: 0,
        invoiceValue: 0,
        variance: 0,
        variancePercent: 0,
      })
      continue
    }

    const tolerancePct = invoiceItem.tolerancePercent / 100

    // Check quantity match
    const receivedQty = poItem.receivedQuantity
    const invoiceQty = invoiceItem.invoiceQuantity
    const qtyVariance = Math.abs(invoiceQty - receivedQty)
    const qtyVariancePct = receivedQty > 0 ? qtyVariance / receivedQty : 1
    if (qtyVariancePct > tolerancePct) {
      mismatches.push({
        purchaseItemId: poItem.id,
        field: 'quantity',
        poValue: receivedQty,
        invoiceValue: invoiceQty,
        variance: qtyVariance,
        variancePercent: Math.round(qtyVariancePct * 10000) / 100,
      })
    }

    // Check amount match
    const poAmount = Number(poItem.totalAmount)
    const invoiceAmount = invoiceItem.invoiceAmount
    const amtVariance = Math.abs(invoiceAmount - poAmount)
    const amtVariancePct = poAmount > 0 ? amtVariance / poAmount : 1
    if (amtVariancePct > tolerancePct) {
      mismatches.push({
        purchaseItemId: poItem.id,
        field: 'amount',
        poValue: poAmount,
        invoiceValue: invoiceAmount,
        variance: Math.round(amtVariance * 100) / 100,
        variancePercent: Math.round(amtVariancePct * 10000) / 100,
      })
    }
  }

  const status = mismatches.length === 0 ? 'MATCHED' : 'MISMATCHED'

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'THREE_WAY_MATCH',
      entity: 'Purchase',
      entityId: data.purchaseId,
      metadata: {
        invoiceNumber: data.invoiceNumber,
        status,
        mismatchCount: mismatches.length,
      },
    },
  })

  return { status, mismatches }
}

// ─── Supplier Payments ────────────────────────────────────────

export async function recordSupplierPayment(
  data: z.infer<typeof supplierPaymentSchema>,
  actor: AuthUser
): Promise<{ payment: Payment; ledgerEntry: { id: string; balance: Prisma.Decimal } }> {
  // Suppliers are global; only scope-check when the payment links a
  // branch-scoped purchase.
  if (data.purchaseId) {
    const linked = await prisma.purchase.findUnique({
      where: { id: data.purchaseId },
      select: { branchId: true },
    })
    if (!linked) throw new Error('Not Found: purchase order')
    await assertBranchAccess(actor, linked.branchId)
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } })
  if (!supplier) throw new Error('Not Found: supplier')

  const result = await prisma.$transaction(async (tx) => {
    // Record payment
    const payment = await tx.payment.create({
      data: {
        method: data.method,
        amount: data.amount,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        supplierId: data.supplierId,
        // Link to purchase if provided
        ...(data.purchaseId ? { purchaseId: data.purchaseId } : {}),
      },
    })

    // Get current supplier ledger balance
    const lastEntry = await tx.supplierLedger.findFirst({
      where: { supplierId: data.supplierId },
      orderBy: { entryDate: 'desc' },
    })
    const currentBalance = lastEntry?.balance ?? new Prisma.Decimal(0)
    const newBalance = currentBalance.minus(data.amount) // payment reduces outstanding

    // Create ledger entry (CREDIT reduces what we owe)
    const ledgerEntry = await tx.supplierLedger.create({
      data: {
        supplierId: data.supplierId,
        type: 'CREDIT',
        amount: data.amount,
        balance: newBalance,
        description: `Payment via ${data.method}${data.reference ? ` (ref: ${data.reference})` : ''}`,
        entryDate: new Date(data.paymentDate),
        referenceType: data.purchaseId ? 'PURCHASE' : 'PAYMENT',
        referenceId: data.purchaseId ?? payment.id,
      },
    })

    // Update supplier outstanding balance
    await tx.supplier.update({
      where: { id: data.supplierId },
      data: { outstandingBalance: { decrement: data.amount } },
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SUPPLIER_PAYMENT',
        entity: 'Supplier',
        entityId: data.supplierId,
        metadata: { amount: data.amount, method: data.method, paymentId: payment.id },
      },
    })

    return { payment, ledgerEntry }
  })

  return result
}

// ─── Purchase Returns ──────────────────────────────────────────

export async function createPurchaseReturn(
  data: z.infer<typeof createPurchaseReturnSchema>,
  actor: AuthUser
): Promise<PurchaseReturn> {
  await ensureDefaultLedgers()

  const purchase = await prisma.purchase.findUnique({
    where: { id: data.purchaseId },
    include: { items: true, supplier: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')
  await assertBranchAccess(actor, purchase.branchId)
  if (!['RECEIVED', 'INVOICED', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
    throw new Error('Purchase must be received before creating a return')
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } })
  if (!supplier) throw new Error('Not Found: supplier')

  const itemMap = new Map(purchase.items.map((i) => [i.id, i]))

  // H11 — server-side validation only. unitCost is intentionally NOT trusted
  // from the request body; we re-price from PurchaseItem.unitCost captured at
  // goods receipt.
  for (const retItem of data.items) {
    const poItem = itemMap.get(retItem.purchaseItemId)
    if (!poItem) throw new Error(`Purchase item not found: ${retItem.purchaseItemId}`)
    const remaining = poItem.receivedQuantity - poItem.returnedQuantity
    if (retItem.quantity > remaining) {
      throw new Error(
        `Return quantity (${retItem.quantity}) exceeds remaining returnable quantity (${remaining}) for item ${poItem.id}`
      )
    }
  }

  const purchaseReturn = await prisma.$transaction(async (tx) => {
    const returnNumber = data.returnNumber ?? `PR-${Date.now()}`

    // Resolve the authoritative unit cost for each line from the DB.
    // Done inside the transaction so the values reflect committed state.
    const pricedLines = data.items.map((item) => {
      const poItem = itemMap.get(item.purchaseItemId)!
      const unitCost = Number(poItem.unitCost)
      return {
        retItem: item,
        poItem,
        unitCost,
        lineTotal: Math.round(unitCost * item.quantity * 100) / 100,
      }
    })
    const returnTotal = Math.round(
      pricedLines.reduce((s, l) => s + l.lineTotal, 0) * 100
    ) / 100

    // Create purchase return header
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        returnNumber,
        purchaseId: data.purchaseId,
        supplierId: data.supplierId,
        returnDate: new Date(data.returnDate),
        reason: data.reason,
        notes: data.notes ?? null,
        status: 'PENDING',
        totalAmount: returnTotal,
        items: {
          create: pricedLines.map(({ retItem, poItem, unitCost, lineTotal }) => ({
            productId: poItem.productId,
            quantity: retItem.quantity,
            unitCost,
            totalAmount: lineTotal,
            reason: retItem.reason,
            batchId: retItem.batchId ?? null,
          })),
        },
      },
    })

    // Reverse inventory for each returned item.
    // H11 — floors enforced; no Math.max(0, …) clamping that would silently
    // make the ledger reflect a different value than what actually shipped.
    for (const { retItem, poItem } of pricedLines) {
      // ─── Inventory floor ──────────────────────────────────────
      const invWhere = {
        productId_branchId: { productId: poItem.productId, branchId: purchase.branchId },
      }
      const inventory = await tx.inventory.findUnique({ where: invWhere })
      if (inventory) {
        if (inventory.availableQuantity < retItem.quantity) {
          throw new Error(
            `Cannot return ${retItem.quantity} of ${poItem.productId}: only ${inventory.availableQuantity} units available in inventory`
          )
        }
        const beforeTotal = inventory.totalQuantity
        const beforeAvailable = inventory.availableQuantity
        const afterTotal = beforeTotal - retItem.quantity
        const afterAvailable = beforeAvailable - retItem.quantity

        const res = await tx.inventory.updateMany({
          where: { id: inventory.id, updatedAt: inventory.updatedAt },
          data: { totalQuantity: afterTotal, availableQuantity: afterAvailable },
        })
        if (res.count !== 1) throw new Error('Conflict: inventory changed concurrently')

        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: 'RETURN_OUT',
            quantity: retItem.quantity,
            quantityBefore: beforeTotal,
            quantityAfter: afterTotal,
            referenceType: 'PURCHASE_RETURN',
            referenceId: purchaseReturn.id,
            batchId: retItem.batchId ?? null,
            notes: `Purchase return ${returnNumber}: ${retItem.reason}`,
            createdById: actor.id,
          },
        })
      }

      // ─── Batch floor (when a batch is identified) ────────────
      if (retItem.batchId) {
        const batch = await tx.batch.findUnique({ where: { id: retItem.batchId } })
        if (!batch) throw new Error(`Batch not found: ${retItem.batchId}`)
        if (batch.quantity < retItem.quantity) {
          throw new Error(
            `Cannot return ${retItem.quantity} units: batch ${batch.batchNumber} has only ${batch.quantity} units on hand`
          )
        }
        await tx.batch.update({
          where: { id: retItem.batchId },
          data: { quantity: { decrement: retItem.quantity } },
        })
      }

      // ─── Narcotic Register — RETURN_TO_SUPPLIER ───────────────
      const product = await tx.product.findUnique({
        where: { id: poItem.productId },
        select: { drugSchedule: true },
      })
      if (product?.drugSchedule === 'NARCOTIC_NDPS') {
        if (!retItem.batchId) {
          throw new Error('Batch ID is required for narcotic supplier returns')
        }
        const prevNarcotic = await tx.narcoticRegister.findFirst({
          where: {
            branchId: purchase.branchId,
            productId: poItem.productId,
          },
          orderBy: { entryDate: 'desc' },
          select: { balanceQuantity: true },
        })
        const prevBalance = prevNarcotic?.balanceQuantity ?? 0

        await tx.narcoticRegister.create({
          data: {
            branchId: purchase.branchId,
            productId: poItem.productId,
            batchId: retItem.batchId,
            movementType: NarcoticMovementType.RETURN_TO_SUPPLIER,
            quantityIn: 0,
            quantityOut: retItem.quantity,
            balanceQuantity: prevBalance - retItem.quantity,
            referenceType: 'PURCHASE_RETURN',
            referenceId: purchaseReturn.id,
            enteredById: actor.id,
            entryDate: new Date(data.returnDate),
          },
        })
      }
    }

    // H11 — increment PurchaseItem.returnedQuantity with CAS so concurrent
    // returns can't collectively over-return a line.
    for (const { retItem, poItem } of pricedLines) {
      const inc = await tx.purchaseItem.updateMany({
        where: { id: poItem.id, returnedQuantity: { lte: poItem.receivedQuantity - retItem.quantity } },
        data: { returnedQuantity: { increment: retItem.quantity } },
      })
      if (inc.count !== 1) {
        throw new Error(
          `Conflict: purchase item ${poItem.id} was concurrently updated — please retry`
        )
      }
    }

    // ─── GST ITC reversal (mirrors the C4 sale-return pattern) ──
    // One PURCHASE_RETURN row per returned purchase line with pro-rata
    // negated amounts so the GSTR-3B ITC claim and audit trail stay correct.
    const purchaseGst = await tx.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: data.purchaseId },
    })
    const gstByLine = new Map(purchaseGst.map((g) => [g.referenceLineId, g]))
    for (const { retItem, poItem } of pricedLines) {
      const original = gstByLine.get(poItem.id)
      if (!original) continue
      const ratio = retItem.quantity / poItem.receivedQuantity
      const prorate = (n: Prisma.Decimal | number | null | undefined): number => {
        const v = Number(n ?? 0)
        return Math.round(v * ratio * 100) / 100
      }
      await tx.gstTransaction.create({
        data: {
          branchId: purchase.branchId,
          type: original.type,
          referenceType: 'PURCHASE_RETURN',
          referenceId: purchaseReturn.id,
          referenceLineId: original.referenceLineId,
          invoiceNumber: purchase.purchaseNumber,
          invoiceDate: purchase.purchaseDate,
          partyGstin: original.partyGstin,
          partyName: original.partyName,
          partyState: original.partyState,
          hsnCode: original.hsnCode,
          taxableAmount: -prorate(original.taxableAmount),
          cgstAmount: -prorate(original.cgstAmount),
          sgstAmount: -prorate(original.sgstAmount),
          igstAmount: -prorate(original.igstAmount),
          totalTax: -prorate(original.totalTax),
          totalAmount: -prorate(original.totalAmount),
          returnPeriod: original.returnPeriod,
          isFiled: false,
        },
      })
    }

    // ─── Supplier ledger (H11 sign fix) ─────────────────────────
    // recordSupplierPayment uses type:'CREDIT' for cash outflows (reduces
    // our liability to the supplier). A purchase return has the same effect:
    // it reduces what we owe. Use CREDIT here too so the convention is
    // consistent across the codebase.
    const lastEntry = await tx.supplierLedger.findFirst({
      where: { supplierId: data.supplierId },
      orderBy: { entryDate: 'desc' },
    })
    const currentBalance = lastEntry?.balance ?? new Prisma.Decimal(0)
    const newBalance = currentBalance.minus(returnTotal)

    await tx.supplierLedger.create({
      data: {
        supplierId: data.supplierId,
        type: 'CREDIT',
        amount: returnTotal,
        balance: newBalance,
        description: `Purchase return ${returnNumber}`,
        entryDate: new Date(data.returnDate),
        referenceType: 'PURCHASE_RETURN',
        referenceId: purchaseReturn.id,
      },
    })

    await tx.supplier.update({
      where: { id: data.supplierId },
      data: { outstandingBalance: { decrement: returnTotal } },
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PURCHASE_RETURN_CREATE',
        entity: 'PurchaseReturn',
        entityId: purchaseReturn.id,
        metadata: {
          returnNumber,
          purchaseId: data.purchaseId,
          supplierId: data.supplierId,
          itemCount: data.items.length,
        },
      },
    })

    return purchaseReturn
  })

  return purchaseReturn
}

// ─── List Purchase Returns ─────────────────────────────────────

export async function listPurchaseReturns(
  params: Partial<z.infer<typeof purchaseReturnListQuerySchema>> = {},
  actor: AuthUser
): Promise<{
  data: (PurchaseReturn & {
    supplier: { id: string; name: string }
    purchase: { id: string; purchaseNumber: string }
  })[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    supplierId,
    status,
    sortBy = 'returnDate',
    sortOrder = 'desc',
  } = purchaseReturnListQuerySchema.parse(params)

  const scope = await resolveBranchScope(actor, branchId)

  const where: Prisma.PurchaseReturnWhereInput = {}
  // PurchaseReturn carries no branchId of its own; scope through its purchase.
  if (scope) where.purchase = { branchId: scope }
  if (supplierId) where.supplierId = supplierId
  if (status) where.status = status
  if (search) {
    where.OR = [
      { returnNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const orderBy: Prisma.PurchaseReturnOrderByWithRelationInput = { [sortBy]: sortOrder }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        supplier: { select: { id: true, name: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
      },
    }),
    prisma.purchaseReturn.count({ where }),
  ])

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}

// ─── Get Purchase Return ─────────────────────────────────────────

export async function getPurchaseReturn(
  id: string,
  actor: AuthUser
): Promise<PurchaseReturnWithDetails | null> {
  const purchaseReturn = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      purchase: { select: { id: true, purchaseNumber: true, branchId: true } },
    },
  })

  if (!purchaseReturn) return null
  await assertBranchAccess(actor, purchaseReturn.purchase.branchId)

  const items = await prisma.purchaseReturnItem.findMany({
    where: { purchaseReturnId: id },
  })

  const productIds = items.map((i) => i.productId)
  const batchIds = items.map((i) => i.batchId).filter(Boolean) as string[]

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  })

  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, batchNumber: true },
  })

  const productMap = new Map(products.map((p) => [p.id, p]))
  const batchMap = new Map(batches.map((b) => [b.id, b]))

  const itemsWithDetails = items.map((item) => ({
    ...item,
    product: productMap.get(item.productId)!,
    batch: item.batchId ? batchMap.get(item.batchId)! : null,
  }))

  return {
    ...purchaseReturn,
    items: itemsWithDetails,
  }
}

// ─── Update Purchase Return ──────────────────────────────────────

export async function updatePurchaseReturn(
  id: string,
  data: z.infer<typeof updatePurchaseReturnSchema>,
  actor: AuthUser
): Promise<PurchaseReturn> {
  const existing = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: { purchase: { select: { branchId: true } } },
  })
  if (!existing) throw new Error('Not Found: purchase return')

  await assertBranchAccess(actor, existing.purchase.branchId)

  const validTransitions: Record<string, string[]> = {
    PENDING: ['APPROVED', 'CANCELLED'],
    APPROVED: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  }

  if (data.status && existing.status !== data.status) {
    const allowed = validTransitions[existing.status] || []
    if (!allowed.includes(data.status)) {
      throw new Error(`Invalid status transition: ${existing.status} → ${data.status}`)
    }
  }

  const purchaseReturn = await prisma.purchaseReturn.update({
    where: { id },
    data,
    include: {
      supplier: { select: { id: true, name: true } },
      purchase: { select: { id: true, purchaseNumber: true } },
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'PURCHASE_RETURN_UPDATE',
      entity: 'PurchaseReturn',
      entityId: id,
      metadata: { changes: data },
    },
  })

  return purchaseReturn
}

export async function getPurchaseReturnById(
  id: string,
  actor: AuthUser
): Promise<
  | (PurchaseReturn & {
      supplier: { id: string; name: string; phone: string | null; email: string | null }
      purchase: {
        id: string
        purchaseNumber: string
        invoiceNumber: string | null
        purchaseDate: Date
      }
      items: (PurchaseReturnItem & {
        product: { id: string; name: string; sku: string }
      })[]
    })
  | null
> {
  const purchaseReturn = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          invoiceNumber: true,
          purchaseDate: true,
          branchId: true,
        },
      },
      items: true,
    },
  })

  if (!purchaseReturn) return null
  await assertBranchAccess(actor, purchaseReturn.purchase.branchId)

  const productIds = purchaseReturn.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const itemsWithProduct = purchaseReturn.items.map((item) => ({
    ...item,
    product: productMap.get(item.productId) ?? {
      id: item.productId,
      name: 'Unknown Product',
      sku: 'N/A',
    },
  }))

  return {
    ...purchaseReturn,
    items: itemsWithProduct,
  }
}
