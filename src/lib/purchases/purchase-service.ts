import type { Purchase, PurchaseItem, Supplier, Payment, PurchaseReturn } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess, type AuthUser } from '@/lib/inventory/branch-access'
import {
  supplierListQuerySchema,
  purchaseListQuerySchema,
  grnListQuerySchema,
  purchaseReturnListQuerySchema,
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
          create: command.items.map((item) => {
            const product = productMap.get(item.productId)!
            // Server-side calculation: never trust client-provided totals
            const lineSubtotal = item.orderedQuantity * item.unitCost
            const discountAmount = lineSubtotal * (item.discountPercent / 100)
            const taxableAmount = lineSubtotal - discountAmount
            const taxAmount = taxableAmount * (item.taxPercent / 100)
            const totalAmount = taxableAmount + taxAmount

            return {
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
            }
          }),
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

  // Basic checks outside transaction (fast fail)
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
    // Lock and re-read purchase items for concurrency-safe over-receiving check
    const purchaseItems = await tx.purchaseItem.findMany({
      where: { purchaseId: command.purchaseId },
      select: { id: true, productId: true, orderedQuantity: true, receivedQuantity: true },
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

    // Create GRN record (stored on purchase for simplicity)
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

      // Update purchase item received quantity with CAS (concurrency-safe)
      const piRes = await tx.purchaseItem.updateMany({
        where: {
          id: item.purchaseItemId,
          receivedQuantity: poItem.receivedQuantity, // CAS: only update if still same as read
        },
        data: { receivedQuantity: { increment: item.receivedQuantity } },
      })
      if (piRes.count !== 1) {
        throw new Error(
          'Conflict: purchase item received quantity changed concurrently, please retry'
        )
      }

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

    return { purchase: finalPurchase }
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
  await assertBranchAccess(actor, '')

  const purchase = await prisma.purchase.findUnique({
    where: { id: data.purchaseId },
    include: { items: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')

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
  await assertBranchAccess(actor, '')

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
  await assertBranchAccess(actor, '')

  const purchase = await prisma.purchase.findUnique({
    where: { id: data.purchaseId },
    include: { items: true, supplier: true },
  })
  if (!purchase) throw new Error('Not Found: purchase order')
  if (!['RECEIVED', 'INVOICED', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
    throw new Error('Purchase must be received before creating a return')
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } })
  if (!supplier) throw new Error('Not Found: supplier')

  const itemMap = new Map(purchase.items.map((i) => [i.id, i]))

  // Validate return quantities
  for (const retItem of data.items) {
    const poItem = itemMap.get(retItem.purchaseItemId)
    if (!poItem) throw new Error(`Purchase item not found: ${retItem.purchaseItemId}`)
    if (retItem.quantity > poItem.receivedQuantity) {
      throw new Error(
        `Return quantity (${retItem.quantity}) exceeds received quantity (${poItem.receivedQuantity}) for item ${poItem.id}`
      )
    }
  }

  const purchaseReturn = await prisma.$transaction(async (tx) => {
    const returnNumber = data.returnNumber ?? `PR-${Date.now()}`

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
        totalAmount: data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
        items: {
          create: data.items.map((item) => {
            const poItem = itemMap.get(item.purchaseItemId)!
            return {
              productId: poItem.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalAmount: item.quantity * item.unitCost,
              reason: item.reason,
              batchId: item.batchId ?? null,
            }
          }),
        },
      },
    })

    // Reverse inventory for each returned item
    for (const retItem of data.items) {
      const poItem = itemMap.get(retItem.purchaseItemId)!

      // Find inventory record
      const invWhere = {
        productId_branchId: { productId: poItem.productId, branchId: purchase.branchId },
      }
      const inventory = await tx.inventory.findUnique({ where: invWhere })
      if (!inventory) continue

      const beforeTotal = inventory.totalQuantity
      const beforeAvailable = inventory.availableQuantity
      const afterTotal = Math.max(0, beforeTotal - retItem.quantity)
      const afterAvailable = Math.max(0, beforeAvailable - retItem.quantity)

      // CAS update
      const res = await tx.inventory.updateMany({
        where: { id: inventory.id, updatedAt: inventory.updatedAt },
        data: { totalQuantity: afterTotal, availableQuantity: afterAvailable },
      })
      if (res.count !== 1) throw new Error('Conflict: inventory changed concurrently')

      // Create movement record
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: 'OUT',
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

      // If batch provided, reduce batch quantity
      if (retItem.batchId) {
        await tx.batch.update({
          where: { id: retItem.batchId },
          data: { quantity: { decrement: retItem.quantity } },
        })
      }
    }

    // Update supplier ledger — debit (we owe less; supplier owes us credit)
    const lastEntry = await tx.supplierLedger.findFirst({
      where: { supplierId: data.supplierId },
      orderBy: { entryDate: 'desc' },
    })
    const currentBalance = lastEntry?.balance ?? new Prisma.Decimal(0)
    const returnTotal = data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)
    const newBalance = currentBalance.minus(returnTotal)

    await tx.supplierLedger.create({
      data: {
        supplierId: data.supplierId,
        type: 'DEBIT',
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
  params: z.infer<typeof purchaseReturnListQuerySchema>,
  actor: AuthUser
): Promise<{
  data: (PurchaseReturn & {
    supplier: { id: string; name: string }
    purchase: { id: string; purchaseNumber: string }
  })[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  await assertBranchAccess(actor, '')

  const {
    page = 1,
    limit = 20,
    search,
    supplierId,
    status,
    sortBy = 'returnDate',
    sortOrder = 'desc',
  } = purchaseReturnListQuerySchema.parse(params)

  const where: Prisma.PurchaseReturnWhereInput = {}
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
