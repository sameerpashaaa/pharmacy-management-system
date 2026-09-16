import type { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import type {
  CreateSaleReturnInput,
  CreditNoteQueryParams,
  SaleReturnQueryParams,
} from '@/lib/validations/sale-return'

export interface ReturnActor {
  id: string
  branchId: string | null
  permissions?: string[]
}

export function generateReturnNumber(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  return `SR-${y}${m}${d}-${randomSuffix}`
}

export function generateCreditNoteNumber(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  return `CN-${y}${m}${d}-${randomSuffix}`
}

const saleReturnInclude = {
  sale: {
    select: {
      id: true,
      invoiceNumber: true,
      saleDate: true,
      totalAmount: true,
      branchId: true,
      status: true,
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
  items: {
    include: {
      saleItem: {
        select: {
          id: true,
          productName: true,
          productSku: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
          returnedQuantity: true,
        },
      },
    },
  },
  creditNote: true,
} satisfies Prisma.SaleReturnInclude

export async function createSaleReturn(input: CreateSaleReturnInput, actor: ReturnActor) {
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    include: {
      items: {
        include: {
          itemBatches: true,
        },
      },
      customer: true,
    },
  })

  if (!sale) {
    throw new Error('Not Found: sale')
  }

  await assertBranchAccess(actor, sale.branchId)

  if (sale.status === 'CANCELLED') {
    throw new Error('Cannot return items for a cancelled sale')
  }

  if (sale.status === 'FULLY_RETURNED') {
    throw new Error('Sale has already been fully returned')
  }

  // Validate items and compute totals
  const itemMap = new Map(sale.items.map((i) => [i.id, i]))
  let returnTotalAmount = 0

  const processedLines: {
    saleItemId: string
    productId: string
    quantity: number
    unitPrice: number
    totalAmount: number
    restockDecision: 'RESTOCK' | 'QUARANTINE' | 'DAMAGE_WRITE_OFF'
    batchId: string | null
  }[] = []

  for (const line of input.items) {
    const saleItem = itemMap.get(line.saleItemId)
    if (!saleItem) {
      throw new Error(`Sale item '${line.saleItemId}' not found on this invoice`)
    }

    const remaining = saleItem.quantity - saleItem.returnedQuantity
    if (line.quantity > remaining) {
      throw new Error(
        `Cannot return ${line.quantity} units; only ${remaining} units remain unreturned for '${saleItem.productName}'`
      )
    }

    const netUnit = Number(saleItem.totalAmount) / saleItem.quantity
    const lineTotal = Math.round(netUnit * line.quantity * 100) / 100
    returnTotalAmount += lineTotal

    const resolvedBatchId = line.batchId ?? saleItem.itemBatches[0]?.batchId ?? null

    processedLines.push({
      saleItemId: line.saleItemId,
      productId: saleItem.productId,
      quantity: line.quantity,
      unitPrice: netUnit,
      totalAmount: lineTotal,
      restockDecision: line.restockDecision ?? 'RESTOCK',
      batchId: resolvedBatchId,
    })
  }

  returnTotalAmount = Math.round(returnTotalAmount * 100) / 100
  const returnNumber = generateReturnNumber()

  const isCredit = input.refundMethod === 'CREDIT'
  const returnStatus = isCredit ? 'CREDITED' : 'REFUNDED'

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create SaleReturn header & items
    const saleReturn = await tx.saleReturn.create({
      data: {
        returnNumber,
        saleId: sale.id,
        customerId: sale.customerId,
        reason: input.reason,
        totalAmount: returnTotalAmount,
        status: returnStatus,
        refundMethod: input.refundMethod,
        refundRef: input.refundRef,
        notes: input.notes,
        processedById: actor.id,
        items: {
          create: processedLines.map((l) => ({
            saleItemId: l.saleItemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            totalAmount: l.totalAmount,
            restockDecision: l.restockDecision,
            batchId: l.batchId,
          })),
        },
      },
    })

    // 2. Increment returnedQuantity on each SaleItem
    for (const line of processedLines) {
      await tx.saleItem.update({
        where: { id: line.saleItemId },
        data: {
          returnedQuantity: { increment: line.quantity },
        },
      })

      // 3. Handle Restock
      if (line.restockDecision === 'RESTOCK') {
        // Re-credit Inventory
        const inv = await tx.inventory.upsert({
          where: {
            productId_branchId: {
              productId: line.productId,
              branchId: sale.branchId,
            },
          },
          update: {
            totalQuantity: { increment: line.quantity },
            availableQuantity: { increment: line.quantity },
          },
          create: {
            productId: line.productId,
            branchId: sale.branchId,
            totalQuantity: line.quantity,
            availableQuantity: line.quantity,
          },
        })

        // Record Inventory Movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inv.id,
            type: 'RETURN_IN',
            quantity: line.quantity,
            quantityBefore: inv.totalQuantity - line.quantity,
            quantityAfter: inv.totalQuantity,
            referenceType: 'SALE_RETURN',
            referenceId: saleReturn.id,
            batchId: line.batchId,
            createdById: actor.id,
            notes: `Customer return ${returnNumber} for invoice ${sale.invoiceNumber}`,
          },
        })

        // Re-credit Batch if identified
        if (line.batchId) {
          const batch = await tx.batch.findUnique({
            where: { id: line.batchId },
          })
          if (batch) {
            const newStatus =
              batch.status === 'EXHAUSTED' && batch.expiryDate > new Date()
                ? 'ACTIVE'
                : batch.status

            await tx.batch.update({
              where: { id: line.batchId },
              data: {
                quantity: { increment: line.quantity },
                soldQuantity: { decrement: line.quantity },
                status: newStatus,
              },
            })
          }
        }
      } else if (line.restockDecision === 'DAMAGE_WRITE_OFF') {
        const inv = await tx.inventory.findUnique({
          where: {
            productId_branchId: {
              productId: line.productId,
              branchId: sale.branchId,
            },
          },
        })

        if (inv) {
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: 'WRITE_OFF',
              quantity: line.quantity,
              quantityBefore: inv.totalQuantity,
              quantityAfter: inv.totalQuantity,
              referenceType: 'SALE_RETURN',
              referenceId: saleReturn.id,
              batchId: line.batchId,
              createdById: actor.id,
              notes: `Damaged return write-off for ${returnNumber}`,
            },
          })
        }
      }
    }

    // 4. Update Sale Status
    const allSaleItems = await tx.saleItem.findMany({
      where: { saleId: sale.id },
    })
    const isFullyReturned = allSaleItems.every((item) => item.returnedQuantity >= item.quantity)
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: isFullyReturned ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED',
      },
    })

    // 5. If Credit Note, issue CreditNote
    if (isCredit) {
      const noteNumber = generateCreditNoteNumber()
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      await tx.creditNote.create({
        data: {
          noteNumber,
          saleReturnId: saleReturn.id,
          customerId: sale.customerId,
          amount: returnTotalAmount,
          balanceUsed: 0,
          status: 'ACTIVE',
          expiresAt,
        },
      })

      // If customer profile exists, update ledger
      if (sale.customerId) {
        await tx.customerLedger.create({
          data: {
            customerId: sale.customerId,
            type: 'CREDIT',
            entryDate: new Date(),
            description: `Credit note ${noteNumber} for return ${returnNumber}`,
            amount: returnTotalAmount,
            balance: returnTotalAmount,
            referenceType: 'SALE_RETURN',
            referenceId: saleReturn.id,
          },
        })
      }
    }

    // 6. Record Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SALE_RETURN_CREATE',
        entity: 'SaleReturn',
        entityId: saleReturn.id,
        newData: {
          returnNumber,
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          totalAmount: returnTotalAmount,
          refundMethod: input.refundMethod,
        },
      },
    })

    return tx.saleReturn.findUnique({
      where: { id: saleReturn.id },
      include: saleReturnInclude,
    })
  })

  return result
}

export async function getSaleReturnById(id: string, actor: ReturnActor) {
  const ret = await prisma.saleReturn.findUnique({
    where: { id },
    include: saleReturnInclude,
  })

  if (!ret) {
    throw new Error('Not Found: sale return')
  }

  await assertBranchAccess(actor, ret.sale.branchId)
  return ret
}

export async function listSaleReturns(
  params: Partial<SaleReturnQueryParams> = {},
  actor: ReturnActor
) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    saleId,
    customerId,
    branchId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params

  const targetBranch = actor.branchId ?? branchId
  if (targetBranch) {
    await assertBranchAccess(actor, targetBranch)
  }

  const where: Prisma.SaleReturnWhereInput = {}

  if (targetBranch) {
    where.sale = { branchId: targetBranch }
  }

  if (status) {
    where.status = status
  }

  if (saleId) {
    where.saleId = saleId
  }

  if (customerId) {
    where.customerId = customerId
  }

  if (search) {
    where.OR = [
      { returnNumber: { contains: search, mode: 'insensitive' } },
      { sale: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const skip = (page - 1) * limit
  const orderBy: Prisma.SaleReturnOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  }

  const [data, total] = await Promise.all([
    prisma.saleReturn.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: saleReturnInclude,
    }),
    prisma.saleReturn.count({ where }),
  ])

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

export async function listCreditNotes(
  params: Partial<CreditNoteQueryParams> = {},
  actor: ReturnActor
) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    customerId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params

  const where: Prisma.CreditNoteWhereInput = {}

  // Branch isolation: credit notes belong to the branch of their sale.
  // Branch-bound actors only see their own branch; branchless (global)
  // actors retain cross-branch visibility per the documented access model.
  if (actor.branchId) {
    where.saleReturn = { sale: { branchId: actor.branchId } }
  }

  if (status) {
    where.status = status
  }

  if (customerId) {
    where.customerId = customerId
  }

  if (search) {
    where.OR = [
      { noteNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const skip = (page - 1) * limit
  const orderBy: Prisma.CreditNoteOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  }

  const [data, total] = await Promise.all([
    prisma.creditNote.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        saleReturn: {
          select: {
            id: true,
            returnNumber: true,
            sale: { select: { id: true, invoiceNumber: true } },
          },
        },
      },
    }),
    prisma.creditNote.count({ where }),
  ])

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

export async function getCreditNoteById(id: string, actor: ReturnActor) {
  const note = await prisma.creditNote.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      saleReturn: {
        include: {
          sale: { select: { id: true, invoiceNumber: true, branchId: true } },
        },
      },
    },
  })

  if (!note) {
    throw new Error('Not Found: credit note')
  }

  await assertBranchAccess(actor, note.saleReturn.sale.branchId)
  return note
}
