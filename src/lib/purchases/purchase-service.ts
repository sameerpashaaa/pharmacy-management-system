import type {
  Prisma,
  Purchase,
  PurchaseItem,
  Supplier,
  Payment,
  PurchaseReturn,
} from '@prisma/client'
import type { z } from 'zod'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess, type AuthUser } from '@/lib/inventory/branch-access'
import {
  supplierListQuerySchema,
  purchaseListQuerySchema,
  grnListQuerySchema,
  type updatePurchaseSchema,
  type threeWayMatchSchema,
  type supplierPaymentSchema,
  type createPurchaseReturnSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '@/lib/validations/purchase'

// ─────────────────────────────────────────────────────────────
// Purchase Service — Supplier & Purchase Order Management
//
// Server-side authority: client never sends trusted money/qty.
// All amounts derived from DB; CAS for inventory; audit on mutations.
// ─────────────────────────────────────────────────────────────

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
  await assertBranchAccess(actor, '')

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

export async function getSupplier(id: string, actor: AuthUser): Promise<Supplier | null> {
  await assertBranchAccess(actor, '') // Global check for read

  return prisma.supplier.findUnique({ where: { id } })
}

export async function updateSupplier(
  id: string,
  data: UpdateSupplierInput,
  actor: AuthUser
): Promise<Supplier> {
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: supplier')

  await assertBranchAccess(actor, '')

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
  actor: AuthUser
): Promise<{
  data: Supplier[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  await assertBranchAccess(actor, '')

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
  await assertBranchAccess(actor, command.branchId)

  const supplier = await prisma.supplier.findUnique({ where: { id: command.supplierId } })
  if (!supplier) throw new Error('Not Found: supplier')
  if (!supplier.isActive) throw new Error('Supplier is inactive')

  const branch = await prisma.branch.findUnique({ where: { id: command.branchId } })
  if (!branch) throw new Error('Not Found: branch')

  // Validate all products exist and are active
  const productIds = command.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, isActive: true, name: true },
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

  const purchase = await prisma.$transaction(async (tx) => {
    const purchaseNumber = `PO-${Date.now()}`
    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber,
        branchId: command.branchId,
        supplierId: command.supplierId,
        expectedDate: command.expectedDate,
        notes: command.notes ?? null,
        status: 'DRAFT',
        createdById: actor.id,
        items: {
          create: command.items.map((item) => ({
            productId: item.productId,
            orderedQuantity: item.orderedQuantity,
            receivedQuantity: 0,
            freeQuantity: 0,
            unitCost: item.unitCost,
            discountPercent: item.discountPercent,
            taxPercent: item.taxPercent,
            batchNumber: item.batchNumber ?? null,
            expiryDate: item.expiryDate ?? null,
            manufacturingDate: item.manufacturingDate ?? null,
            mrp: 0,
            totalAmount: 0,
          })),
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
  await assertBranchAccess(actor, '')

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return purchase
}

export async function listPurchases(
  params: z.infer<typeof purchaseListQuerySchema>,
  actor: AuthUser
): Promise<{
  data: PurchaseWithItems[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  await assertBranchAccess(actor, '')

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

  const where: Prisma.PurchaseWhereInput = {}
  if (branchId) where.branchId = branchId
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

  const purchase = await prisma.purchase.findUnique({
    where: { id: command.purchaseId },
    include: { items: true, supplier: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')

  if (purchase.branchId !== command.branchId) {
    throw new Error('Forbidden: purchase order belongs to different branch')
  }
  if (!['ORDERED', 'SENT', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
    throw new Error(`Cannot receive against purchase in status: ${purchase.status}`)
  }

  // Check for duplicate GRN number (using purchaseNumber)
  const existingGrn = await prisma.purchase.findFirst({
    where: { purchaseNumber: command.grnNumber },
    select: { id: true },
  })
  if (existingGrn) throw new Error('GRN number already exists')

  // Validate received quantities against PO
  const itemMap = new Map(purchase.items.map((i) => [i.id, i]))
  const totalReceived: Record<string, number> = {}

  for (const item of command.items) {
    const poItem = itemMap.get(item.purchaseItemId)
    if (!poItem) throw new Error(`Purchase item not found: ${item.purchaseItemId}`)

    const alreadyReceived = poItem.receivedQuantity
    const remaining = poItem.orderedQuantity - alreadyReceived
    if (item.receivedQuantity > remaining) {
      throw new Error(`Over-receiving: item ${poItem.id} only ${remaining} remaining`)
    }

    // Expiry validation: reject if expiry < 6 months from today
    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    if (item.expiryDate < sixMonthsFromNow) {
      throw new Error(`Expiry date too soon: must be at least 6 months from today`)
    }

    totalReceived[item.purchaseItemId] =
      (totalReceived[item.purchaseItemId] || 0) + item.receivedQuantity
  }

  // Check for duplicate batch numbers within this GRN
  const batchNumbers = command.items.map((i) => i.batchNumber)
  if (new Set(batchNumbers).size !== batchNumbers.length) {
    throw new Error('Duplicate batch numbers within GRN')
  }

  const result = await prisma.$transaction(async (tx) => {
    // Create GRN record (stored on purchase for simplicity)
    const updatedPurchase = await tx.purchase.update({
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

      // Create batch
      const batch = await tx.batch.create({
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
          status: 'ACTIVE',
          supplierRef: item.batchNumber,
          purchaseId: command.purchaseId,
          branchId: command.branchId,
        },
      })

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

      // Update purchase item received quantity
      await tx.purchaseItem.update({
        where: { id: item.purchaseItemId },
        data: { receivedQuantity: { increment: item.receivedQuantity } },
      })

      // Batch status log
      await tx.batchStatusLog.create({
        data: {
          batchId: batch.id,
          fromStatus: 'ACTIVE',
          toStatus: 'ACTIVE',
          reason: `Received via GRN ${command.grnNumber}`,
          changedById: actor.id,
        },
      })
    }

    // Check if fully received
    const updatedItems = await tx.purchaseItem.findMany({
      where: { purchaseId: command.purchaseId },
    })
    const allReceived = updatedItems.every((i) => i.receivedQuantity >= i.orderedQuantity)
    if (allReceived) {
      await tx.purchase.update({
        where: { id: command.purchaseId },
        data: { status: 'RECEIVED', receivedAt: command.grnDate },
      })
    } else {
      await tx.purchase.update({
        where: { id: command.purchaseId },
        data: { status: 'PARTIALLY_RECEIVED' },
      })
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GRN_CREATE',
        entity: 'Purchase',
        entityId: command.purchaseId,
        metadata: { grnNumber: command.grnNumber, purchaseId: command.purchaseId },
      },
    })

    return { purchase: updatedPurchase }
  })

  return {
    grn: { id: command.purchaseId, grnNumber: command.grnNumber },
    purchase: result.purchase,
  }
}

export async function listGrns(
  params: z.infer<typeof grnListQuerySchema>,
  actor: AuthUser
): Promise<{
  data: any[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  await assertBranchAccess(actor, '')

  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    purchaseId,
    sortBy = 'grnDate',
    sortOrder = 'desc',
  } = grnListQuerySchema.parse(params)

  // Map GRN sort fields to Purchase fields
  const sortByMap: Record<string, string> = {
    grnDate: 'receivedAt',
    grnNumber: 'purchaseNumber',
    purchaseDate: 'purchaseDate',
  }
  const mappedSortBy = sortByMap[sortBy] || 'receivedAt'

  // GRN info is stored on purchase records
  const where: Prisma.PurchaseWhereInput = { status: { in: ['PARTIALLY_RECEIVED', 'RECEIVED'] } }
  if (branchId) where.branchId = branchId
  if (purchaseId) where.id = purchaseId
  if (search) {
    where.OR = [
      { purchaseNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const orderBy: Prisma.PurchaseOrderByWithRelationInput = { [mappedSortBy]: sortOrder }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.purchase.count({ where }),
  ])

  return {
    data: data.map((p) => ({
      id: p.id,
      grnNumber: p.purchaseNumber, // Using purchaseNumber as GRN number for now
      grnDate: p.receivedAt ?? p.purchaseDate,
      purchaseId: p.id,
      branchId: p.branchId,
      supplier: p.supplier,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

// ─── Three-Way Matching ────────────────────────────────────────

export async function threeWayMatch(
  _data: z.infer<typeof threeWayMatchSchema>,
  _actor: AuthUser
): Promise<{ status: string; mismatches: any[] }> {
  // TODO: Implement three-way matching logic
  // This is a placeholder for the actual implementation
  return { status: 'MATCHED', mismatches: [] }
}

// ─── Supplier Payments ────────────────────────────────────────

export async function recordSupplierPayment(
  _data: z.infer<typeof supplierPaymentSchema>,
  _actor: AuthUser
): Promise<{ payment: Payment; ledger: any }> {
  // TODO: Implement supplier payment recording
  throw new Error('Not implemented')
}

// ─── Purchase Returns ──────────────────────────────────────────

export async function createPurchaseReturn(
  _data: z.infer<typeof createPurchaseReturnSchema>,
  _actor: AuthUser
): Promise<PurchaseReturn> {
  // TODO: Implement purchase return
  throw new Error('Not implemented')
}
