// ─────────────────────────────────────────────────────────────
// Sales Service — POS create/read + Held Bills
//
// createSale is the transactional core of the POS:
//  1. Server-side authorization + settings-gated policy
//     (discount limits, credit sales, customer capture) —
//     the client NEVER sends a price, tax or discount amount.
//  2. Products are resolved by id / barcode / sku inside the same
//     transaction; prescription-gated items require a prescription.
//  3. Stock is consumed FEFO-first (or oldest-first when the
//     `inventory.fefo_enabled` setting is off) using the existing
//     pure allocation (`src/lib/batches/fefo.ts`), re-read and
//     deducted with optimistic CAS on the batch row. Fully consumed
//     batches flip to EXHAUSTED with a status log.
//  4. The product-branch inventory aggregate is decremented with a
//     CAS guarded by `updatedAt` (same pattern as stock
//     adjustments). `available = total - reserved` is preserved.
//  5. The whole mutation (sale + items + batch links + payments +
//     inventory movements + audit) commits as one transaction.
//     Oversell is impossible: under Serializable isolation a lost
//     CAS race aborts the loser, and the retry wrapper re-runs on
//     transient conflicts (P2034 / P2002).
//  6. Concurrency-safe invoice numbering uses the per-branch
//     `invoicePrefix` / `invoiceCounter` columns with its own CAS.
//
// Rollback and concurrency are exercised against a real Postgres
// in `sales-service.integration.test.ts`.
// ─────────────────────────────────────────────────────────────
import type { NarcoticMovementType, PaymentMethod, PaymentStatus } from '@prisma/client'
import { Prisma } from '@prisma/client'

import {
  allocateFefo,
  filterEligibleBatches,
  type FefoBatchCandidate,
  type FefoResult,
} from '@/lib/batches/fefo'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { ensureDefaultLedgers } from '@/lib/finance/coa-seed'
import { postGstTransactionForSale } from '@/lib/finance/gst-service'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import {
  computeItemPricing,
  computeSaleTotals,
  round2,
  type ItemPricingRow,
} from '@/lib/sales/pricing'
import { getPosSettings } from '@/lib/settings/settings-service'

// ─── Types ────────────────────────────────────────────────────

export interface SaleActor {
  id: string
  branchId: string | null
  permissions?: string[]
}

export interface CreateSaleItemInput {
  productId?: string
  barcode?: string
  sku?: string
  quantity: number
  looseUnits?: number
  discountPercent?: number
}

export interface CreateSalePaymentInput {
  method: PaymentMethod
  amount: number
  reference?: string
}

export interface CreditCustomerInput {
  name: string
  phone?: string
}

export interface ScheduleH1CaptureInput {
  patientName: string
  patientAddress: string
  patientPhone?: string
  doctorName: string
  doctorRegNo: string
}

interface H1RegisterRow {
  productId: string
  batchId: string
  medicineName: string
  batchNumber: string
  quantityGiven: number
  patientName: string
  patientAddress: string
  patientPhone?: string
  doctorName: string
  doctorRegNo: string
  createdById: string
}

interface NarcoticRegisterRow {
  branchId: string
  productId: string
  batchId: string
  movementType: NarcoticMovementType
  quantityOut: number
  balanceQuantity: number
  referenceType: string
  patientName: string
  doctorName: string
  doctorRegNo: string
  enteredById: string
}

export interface CreateSaleCommand {
  branchId: string
  items: CreateSaleItemInput[]
  payments: CreateSalePaymentInput[]
  customerId?: string
  /** Minimal POS customer capture — used only for credit sales. */
  customer?: CreditCustomerInput
  prescriptionId?: string
  notes?: string
  h1Capture?: ScheduleH1CaptureInput
}

const saleProductSelect = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  isActive: true,
  isPrescriptionRequired: true,
  drugSchedule: true,
  mrp: true,
  gstRate: true,
  cgstRate: true,
  sgstRate: true,
  igstRate: true,
  isGstExempt: true,
  hsnCode: true,
  unitOfMeasure: true,
  tabsPerStrip: true,
} as const

type SaleProduct = Prisma.ProductGetPayload<{ select: typeof saleProductSelect }>

export const saleListItemInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
} as const

export const saleDetailInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      itemBatches: {
        include: { batch: { select: { id: true, batchNumber: true, expiryDate: true } } },
      },
    },
  },
  payments: { orderBy: { createdAt: 'asc' } },
  returns: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      returnNumber: true,
      returnDate: true,
      totalAmount: true,
      status: true,
      refundMethod: true,
    },
  },
} as const

export type SaleListItem = Prisma.SaleGetPayload<{ include: typeof saleListItemInclude }>
export type SaleDetail = Prisma.SaleGetPayload<{ include: typeof saleDetailInclude }>

export interface SaleListParams {
  page?: number
  limit?: number
  search?: string
  branchId?: string
  status?: string
  paymentStatus?: string
  sortBy?: 'saleDate' | 'invoiceNumber' | 'totalAmount'
  sortOrder?: 'asc' | 'desc'
}

export interface SaleListResult {
  data: SaleListItem[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

interface InventoryMovementInput {
  inventoryId: string
  quantityBefore: number
  quantityAfter: number
  quantity: number
}

// ─── Pure helpers (unit tested) ───────────────────────────────

/**
 * Sum of real cash received (excludes CREDIT payments — those only
 * record the credit agreement, not money in hand).
 */
export function cashReceived(payments: CreateSalePaymentInput[]): number {
  return round2(payments.filter((p) => p.method !== 'CREDIT').reduce((s, p) => s + p.amount, 0))
}

export function derivePaymentStatus(
  payments: CreateSalePaymentInput[],
  totalAmount: number
): PaymentStatus {
  const paid = cashReceived(payments)
  if (payments.some((p) => p.method === 'CREDIT')) return 'CREDIT'
  if (paid > totalAmount) return 'OVERPAID'
  if (paid >= totalAmount) return 'PAID'
  return 'PARTIAL'
}

/** `INV-{code|BR}-0001` from the branch's counter. */
export function buildInvoiceNumber(prefix: string, code: string | null, sequence: number): string {
  const tag = (code?.trim() || 'BR').toUpperCase()
  return `${prefix}-${tag}-${String(sequence).padStart(4, '0')}`
}

// ─── Read: list + detail ──────────────────────────────────────

export async function listSales(
  params: SaleListParams,
  scope: string | null
): Promise<SaleListResult> {
  const {
    page = 1,
    limit = 20,
    search,
    branchId,
    status,
    paymentStatus,
    sortBy = 'saleDate',
    sortOrder = 'desc',
  } = params

  const where: Prisma.SaleWhereInput = {}
  if (scope) where.branchId = scope
  else if (branchId) where.branchId = branchId
  if (status) where.status = status as never
  if (paymentStatus) where.paymentStatus = paymentStatus as never
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const orderBy = { [sortBy]: sortOrder } as Prisma.SaleOrderByWithRelationInput

  const skip = (page - 1) * limit
  const [data, total] = await Promise.all([
    prisma.sale.findMany({ where, skip, take: limit, orderBy, include: saleListItemInclude }),
    prisma.sale.count({ where }),
  ])

  return {
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

export async function getSaleById(id: string, scope: string | null): Promise<SaleDetail> {
  const sale = await prisma.sale.findUnique({ where: { id }, include: saleDetailInclude })
  if (!sale) throw new Error('Not Found: sale')
  if (scope && sale.branchId !== scope) {
    throw new Error(`Forbidden: no access to sale '${id}'`)
  }
  return sale
}

// ─── POS Product Search ───────────────────────────────────────

export interface PosProductRow {
  id: string
  name: string
  genericName: string | null
  sku: string
  barcode: string | null
  unitOfMeasure: string
  mrp: number
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  hsnCode: string | null
  drugSchedule: string
  isPrescriptionRequired: boolean
  isGstExempt: boolean
  additionalBarcodes: string[]
  availableQuantity: number
  tabsPerStrip?: number | null
  rackCode?: string | null
  categoryName?: string | null
  manufacturer?: string | null
  composition?: string | null
  packSize?: string | null
  imageUrl?: string | null
}

/**
 * Fast cart search: active products matching a free-text term plus
 * their current available stock for one branch. Prices/GST are
 * returned for preview only — the authoritative amounts are always
 * recomputed server-side at sale time.
 */
export async function searchPosProducts(
  search: string | undefined,
  branchId: string,
  limit = 60
): Promise<PosProductRow[]> {
  const where: Prisma.ProductWhereInput = { isActive: true }
  const cleanSearch = search?.trim()
  if (cleanSearch) {
    where.OR = [
      { name: { contains: cleanSearch, mode: 'insensitive' } },
      { genericName: { contains: cleanSearch, mode: 'insensitive' } },
      { sku: { contains: cleanSearch, mode: 'insensitive' } },
      { barcode: { contains: cleanSearch, mode: 'insensitive' } },
      { manufacturer: { contains: cleanSearch, mode: 'insensitive' } },
      { composition: { contains: cleanSearch, mode: 'insensitive' } },
      { barcodes: { some: { barcode: { contains: cleanSearch, mode: 'insensitive' } } } },
    ]
  }

  const products = await prisma.product.findMany({
    where,
    take: limit,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      genericName: true,
      sku: true,
      barcode: true,
      unitOfMeasure: true,
      tabsPerStrip: true,
      mrp: true,
      gstRate: true,
      cgstRate: true,
      sgstRate: true,
      igstRate: true,
      hsnCode: true,
      drugSchedule: true,
      isPrescriptionRequired: true,
      isGstExempt: true,
      manufacturer: true,
      composition: true,
      packSize: true,
      imageUrl: true,
      rack: { select: { code: true, shelfNumber: true } },
      categories: {
        take: 1,
        select: {
          category: { select: { name: true } },
        },
      },
      barcodes: { select: { barcode: true } },
    },
  })

  const inventory = await prisma.inventory.findMany({
    where: { branchId, productId: { in: products.map((p) => p.id) } },
    select: { productId: true, availableQuantity: true },
  })
  const availableByProduct = new Map(inventory.map((i) => [i.productId, i.availableQuantity]))

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    genericName: p.genericName,
    sku: p.sku,
    barcode: p.barcode,
    unitOfMeasure: p.unitOfMeasure,
    tabsPerStrip: p.tabsPerStrip ?? null,
    mrp: Number(p.mrp),
    gstRate: Number(p.gstRate),
    cgstRate: Number(p.cgstRate),
    sgstRate: Number(p.sgstRate),
    igstRate: Number(p.igstRate),
    hsnCode: p.hsnCode ?? null,
    drugSchedule: p.drugSchedule,
    isPrescriptionRequired: p.isPrescriptionRequired,
    isGstExempt: p.isGstExempt,
    additionalBarcodes: p.barcodes.map((b) => b.barcode).filter((b) => b !== p.barcode),
    availableQuantity: availableByProduct.get(p.id) ?? 0,
    rackCode: p.rack ? `${p.rack.code}/${p.rack.shelfNumber}` : null,
    categoryName: p.categories[0]?.category.name ?? null,
    manufacturer: p.manufacturer ?? null,
    composition: p.composition ?? null,
    packSize: p.packSize ?? null,
    imageUrl: p.imageUrl ?? null,
  }))
}

// ─── Held Bills ───────────────────────────────────────────────

export interface CreateHeldBillCommand {
  branchId?: string
  label?: string
  cartData: Prisma.InputJsonValue
  customerId?: string
}

export async function createHeldBill(command: CreateHeldBillCommand, actor: SaleActor) {
  const branchId = command.branchId ?? actor.branchId
  if (!branchId) throw new Error('Branch is required')
  if (actor.branchId) {
    await assertBranchAccess(actor, branchId)
  } else {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })
    if (!branch) throw new Error('Not Found: branch')
  }

  return prisma.heldBill.create({
    data: {
      branchId,
      userId: actor.id,
      label: command.label ?? null,
      cartData: command.cartData,
      customerId: command.customerId ?? null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })
}

export function listHeldBills(actor: SaleActor, branchId?: string, limit = 20) {
  return prisma.heldBill.findMany({
    where: { userId: actor.id, ...(branchId ? { branchId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function deleteHeldBill(id: string, actor: SaleActor): Promise<void> {
  const res = await prisma.heldBill.deleteMany({ where: { id, userId: actor.id } })
  if (res.count !== 1) throw new Error('Not Found: held bill')
}

// ─── Create Sale ──────────────────────────────────────────────

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
  )
}

function isSerializationError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2034'
  )
}

async function runWithRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!isUniqueConstraintError(e) && !isSerializationError(e)) throw e
      lastError = e
      if (i === attempts - 1) {
        throw new Error('Conflict: a concurrent sale changed the data, please retry')
      }
    }
  }
  throw lastError
}

async function resolveProduct(
  tx: Prisma.TransactionClient,
  line: CreateSaleItemInput
): Promise<SaleProduct | null> {
  const where =
    line.productId !== undefined
      ? { id: line.productId }
      : line.barcode !== undefined
        ? { barcode: line.barcode }
        : { sku: line.sku }

  let product = await tx.product.findUnique({ where, select: saleProductSelect })
  if (!product && line.barcode) {
    const barcodeRow = await tx.productBarcode.findUnique({
      where: { barcode: line.barcode },
      select: { productId: true },
    })
    if (barcodeRow) {
      product = await tx.product.findUnique({
        where: { id: barcodeRow.productId },
        select: saleProductSelect,
      })
    }
  }
  return product
}

interface BatchMove {
  batchId: string
  quantity: number
  unitPrice: number
}

type BatchRowWithAge = FefoBatchCandidate & { createdAt: Date }

/**
 * Non-FEFO allocation: same eligibility + greedy, but ordered by
 * oldest batch creation first (not earliest expiry). Used when the
 * `inventory.fefo_enabled` setting is off. Expired/blocked/disposed/
 * exhausted batches are still never selected.
 */
export function allocateByCreationDate(
  candidates: BatchRowWithAge[],
  requestedQuantity: number
): FefoResult {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Requested quantity must be a positive integer')
  }
  const pool = filterEligibleBatches(candidates)
  if (pool.length === 0) {
    return {
      status: 'no_stock',
      requestedQuantity,
      allocatedQuantity: 0,
      shortfall: requestedQuantity,
      allocations: [],
    }
  }
  const createdAtById = new Map(candidates.map((c) => [c.id, c.createdAt.getTime()]))
  const sorted = [...pool].sort(
    (a, b) =>
      (createdAtById.get(a.batchId) ?? 0) - (createdAtById.get(b.batchId) ?? 0) ||
      a.batchId.localeCompare(b.batchId)
  )

  let remaining = requestedQuantity
  const allocations = []
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

export async function createSale(
  command: CreateSaleCommand,
  actor: SaleActor
): Promise<SaleDetail> {
  await ensureDefaultLedgers()
  const settings = await getPosSettings()
  const permissions = actor.permissions ?? []

  await assertBranchAccess(actor, command.branchId)

  // ─── Policy gates (server authority) ─────────────────────────
  const hasDiscount = permissions.includes(PERMISSIONS.SALES_DISCOUNT)
  const hasDiscountOverride = permissions.includes(PERMISSIONS.SALES_DISCOUNT_OVERRIDE)
  const hasCredit = permissions.includes(PERMISSIONS.SALES_CREDIT)

  for (const line of command.items) {
    const lineDiscount = line.discountPercent ?? 0
    if (lineDiscount <= 0) continue
    if (!hasDiscount) throw new Error('Forbidden: requires permission sales:discount')
    if (lineDiscount > settings.maxDiscountPercent && !hasDiscountOverride) {
      throw new Error(
        `Discount of ${lineDiscount}% exceeds the maximum allowed ${settings.maxDiscountPercent}%`
      )
    }
  }

  const usingCredit = command.payments.some((p) => p.method === 'CREDIT')
  if (usingCredit) {
    if (!hasCredit) throw new Error('Forbidden: requires permission sales:credit')
    if (!settings.allowCreditSales) throw new Error('Credit sales are disabled')
    if (settings.requireCustomerForCredit && !command.customerId && !command.customer) {
      throw new Error('A customer is required for credit sales')
    }
  }
  if (command.customer && !usingCredit) {
    throw new Error('Customer capture is only supported for credit sales')
  }

  const received = cashReceived(command.payments)

  return runWithRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const branch = await tx.branch.findUnique({
          where: { id: command.branchId },
          select: { id: true, code: true, invoicePrefix: true, invoiceCounter: true },
        })
        if (!branch) throw new Error('Not Found: branch')

        // ─── Resolve products + prescription gate ────────────────
        const resolved: { product: SaleProduct; input: CreateSaleItemInput }[] = []
        for (const line of command.items) {
          const product = await resolveProduct(tx, line)
          if (!product) throw new Error('Not Found: product')
          if (!product.isActive) throw new Error(`Product is inactive: ${product.name}`)
          const needsPrescription = product.isPrescriptionRequired || product.drugSchedule === 'X'
          if (needsPrescription && !command.prescriptionId) {
            throw new Error(`Prescription required for ${product.name}`)
          }
          resolved.push({ product, input: line })
        }

        if (command.prescriptionId) {
          const rx = await tx.prescription.findUnique({
            where: { id: command.prescriptionId },
            select: { branchId: true, status: true },
          })
          if (!rx) throw new Error('Not Found: prescription')
          if (rx.branchId !== command.branchId) {
            throw new Error(
              `Forbidden: prescription does not belong to branch '${command.branchId}'`
            )
          }
          if (rx.status !== 'APPROVED') {
            throw new Error(
              `Prescription '${command.prescriptionId}' is not approved for dispensing (status: ${rx.status})`
            )
          }
        }

        // ─── Customer (existing or minimal POS capture for credit) ─
        let customerId: string | null = command.customerId ?? null
        if (customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: customerId },
            select: { id: true, isActive: true },
          })
          if (!customer) throw new Error('Not Found: customer')
          if (!customer.isActive) throw new Error('Customer is inactive')
        } else if (command.customer) {
          const created = await tx.customer.create({
            data: { name: command.customer.name, phone: command.customer.phone ?? null },
          })
          customerId = created.id
        }

        // ─── Per line: price, allocate stock, deduct with CAS ────
        const pricingLines: ItemPricingRow[] = []
        const saleItemInputs: Prisma.SaleItemCreateWithoutSaleInput[] = []
        const movements: InventoryMovementInput[] = []
        const h1Registers: H1RegisterRow[] = []
        const narcoticRegisters: NarcoticRegisterRow[] = []

        const requiresH1 = resolved.some(
          (r) => r.product.drugSchedule === 'H1' || r.product.drugSchedule === 'NARCOTIC_NDPS'
        )
        if (requiresH1 && !command.h1Capture) {
          throw new Error('Schedule H1 / Narcotic drugs require patient and doctor details')
        }

        for (const { product, input } of resolved) {
          const quantity = input.quantity
          // Inventory is accounted in sale units (strips/bottles). Loose-unit
          // (tablet-level) dispensing would require base-unit inventory and is
          // not supported: fail closed instead of mis-deducting stock.
          if ((input.looseUnits ?? 0) > 0) {
            throw new Error(`Loose-unit dispensing is not supported for ${product.name}`)
          }
          const totalBaseQty = quantity
          const billableQuantity = quantity
          if (totalBaseQty <= 0) {
            throw new Error(`Quantity must be positive for ${product.name}`)
          }
          const inventory = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: product.id, branchId: branch.id } },
          })
          if (!inventory)
            throw new Error(`Insufficient available stock: ${product.name} (available 0)`)
          if (inventory.availableQuantity < totalBaseQty) {
            throw new Error(
              `Insufficient available stock: ${product.name} (available ${inventory.availableQuantity})`
            )
          }

          const batchRows = await tx.batch.findMany({
            where: {
              productId: product.id,
              branchId: branch.id,
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
              mrp: true,
              createdAt: true,
            },
            orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
          })

          const allocation = settings.fefoEnabled
            ? allocateFefo(filterEligibleBatches(batchRows as FefoBatchCandidate[]), totalBaseQty)
            : allocateByCreationDate(batchRows, totalBaseQty)

          if (allocation.status !== 'success') {
            throw new Error(
              `Insufficient available stock: ${product.name} (available ${allocation.allocatedQuantity})`
            )
          }

          const itemBatchMoves: BatchMove[] = []
          for (const a of allocation.allocations) {
            const batch = batchRows.find((b) => b.id === a.batchId)
            if (!batch) throw new Error('Conflict: batch changed concurrently, please retry')
            const newSold = batch.soldQuantity + a.allocatedQuantity
            const remaining = batch.quantity - batch.reservedQuantity - newSold

            const deducted = await tx.batch.updateMany({
              where: {
                id: batch.id,
                quantity: batch.quantity,
                soldQuantity: batch.soldQuantity,
                status: 'ACTIVE',
              },
              data: { soldQuantity: newSold },
            })
            if (deducted.count !== 1) {
              throw new Error('Conflict: batch changed concurrently, please retry')
            }

            if (remaining === 0 && batch.reservedQuantity === 0) {
              const exhausted = await tx.batch.updateMany({
                where: { id: batch.id, soldQuantity: newSold, status: 'ACTIVE' },
                data: { status: 'EXHAUSTED' },
              })
              if (exhausted.count !== 1) {
                throw new Error('Conflict: batch changed concurrently, please retry')
              }
              await tx.batchStatusLog.create({
                data: {
                  batchId: batch.id,
                  fromStatus: 'ACTIVE',
                  toStatus: 'EXHAUSTED',
                  reason: 'Stock depleted by POS sale',
                  changedById: actor.id,
                },
              })
            }

            itemBatchMoves.push({
              batchId: batch.id,
              quantity: a.allocatedQuantity,
              unitPrice: Number(batch.mrp),
            })

            if (
              command.h1Capture &&
              (product.drugSchedule === 'H1' || product.drugSchedule === 'NARCOTIC_NDPS')
            ) {
              h1Registers.push({
                productId: product.id,
                batchId: batch.id,
                medicineName: product.name,
                batchNumber: batch.batchNumber,
                quantityGiven: a.allocatedQuantity,
                patientName: command.h1Capture.patientName,
                patientAddress: command.h1Capture.patientAddress,
                patientPhone: command.h1Capture.patientPhone,
                doctorName: command.h1Capture.doctorName,
                doctorRegNo: command.h1Capture.doctorRegNo,
                createdById: actor.id,
              })

              if (product.drugSchedule === 'NARCOTIC_NDPS') {
                narcoticRegisters.push({
                  branchId: branch.id,
                  productId: product.id,
                  batchId: batch.id,
                  movementType: 'SALES_DISPENSE',
                  quantityOut: a.allocatedQuantity,
                  balanceQuantity: 0,
                  referenceType: 'SALE',
                  patientName: command.h1Capture.patientName,
                  doctorName: command.h1Capture.doctorName,
                  doctorRegNo: command.h1Capture.doctorRegNo,
                  enteredById: actor.id,
                })
              }
            }
          }

          // Aggregate product-branch inventory deduction (CAS by updatedAt).
          const afterTotal = inventory.totalQuantity - totalBaseQty
          const afterAvailable = inventory.availableQuantity - totalBaseQty
          let runningNarcoticBalance = inventory.availableQuantity
          for (let i = narcoticRegisters.length - 1; i >= 0; i -= 1) {
            const entry = narcoticRegisters[i]
            if (entry.productId !== product.id) break
            runningNarcoticBalance -= entry.quantityOut
            entry.balanceQuantity = runningNarcoticBalance
          }
          if (afterAvailable < 0) {
            throw new Error('Conflict: stock changed concurrently, please retry')
          }
          const inventoryCtx = await tx.inventory.updateMany({
            where: { id: inventory.id, updatedAt: inventory.updatedAt },
            data: { totalQuantity: afterTotal, availableQuantity: afterAvailable },
          })
          if (inventoryCtx.count !== 1) {
            throw new Error('Conflict: inventory changed concurrently, please retry')
          }
          movements.push({
            inventoryId: inventory.id,
            quantityBefore: inventory.totalQuantity,
            quantityAfter: afterTotal,
            quantity: -totalBaseQty,
          })

          const pricing = computeItemPricing({
            quantity: billableQuantity,
            mrp: Number(product.mrp),
            gstRate: Number(product.gstRate),
            cgstRate: Number(product.cgstRate),
            sgstRate: Number(product.sgstRate),
            igstRate: Number(product.igstRate),
            isGstExempt: product.isGstExempt,
            discountPercent: input.discountPercent ?? 0,
            taxInclusive: settings.taxInclusive,
          })
          pricingLines.push(pricing)

          saleItemInputs.push({
            product: { connect: { id: product.id } },
            productName: product.name,
            productSku: product.sku,
            quantity,
            billedUnits: quantity,
            looseUnits: 0,
            totalBaseQty: quantity,
            unitPrice: pricing.unitPrice,
            discountPercent: pricing.discountPercent,
            discountAmount: pricing.discountAmount,
            taxPercent: pricing.taxPercent,
            cgstPercent: pricing.cgstPercent,
            sgstPercent: pricing.sgstPercent,
            igstPercent: pricing.igstPercent,
            taxAmount: pricing.taxAmount,
            totalAmount: pricing.totalAmount,
            mrp: pricing.unitPrice,
            hsnCode: product.hsnCode ?? null,
            itemBatches: { create: itemBatchMoves },
          })
        }

        const totals = computeSaleTotals(pricingLines, {
          taxInclusive: settings.taxInclusive,
          roundOffTotal: settings.roundOffTotal,
        })

        // ─── Invoice number: atomic per-branch counter ───────────
        const sequence = branch.invoiceCounter
        const invoiceNumber = buildInvoiceNumber(branch.invoicePrefix, branch.code, sequence)
        const counterUpdate = await tx.branch.updateMany({
          where: { id: branch.id, invoiceCounter: sequence },
          data: { invoiceCounter: sequence + 1 },
        })
        if (counterUpdate.count !== 1) {
          throw new Error('Conflict: invoice counter changed concurrently, please retry')
        }

        const paymentStatus = derivePaymentStatus(command.payments, totals.totalAmount)
        const balanceDue = round2(Math.max(0, totals.totalAmount - received))

        const sale = await tx.sale.create({
          data: {
            invoiceNumber,
            branchId: branch.id,
            customerId,
            prescriptionId: command.prescriptionId ?? null,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            discountPercent: totals.discountPercent,
            taxAmount: totals.taxAmount,
            cgstAmount: totals.cgstAmount,
            sgstAmount: totals.sgstAmount,
            igstAmount: totals.igstAmount,
            totalAmount: totals.totalAmount,
            amountPaid: received,
            balanceDue,
            status: 'COMPLETED',
            paymentStatus,
            notes: command.notes ?? null,
            createdById: actor.id,
            items: { create: saleItemInputs },
            payments: {
              create: command.payments.map((p) => ({
                method: p.method,
                amount: p.amount,
                reference: p.reference ?? null,
                customerId: customerId ?? null,
              })),
            },
          },
          include: saleDetailInclude,
        })

        if (customerId && balanceDue > 0 && tx.customer?.findUnique && tx.customerLedger?.create) {
          const customer = await tx.customer.findUnique({ where: { id: customerId } })
          if (customer) {
            const newBal = customer.outstandingBalance.add(new Prisma.Decimal(balanceDue))
            await tx.customer.update({
              where: { id: customerId },
              data: { outstandingBalance: newBal },
            })
            await tx.customerLedger.create({
              data: {
                customerId,
                type: 'DEBIT',
                amount: new Prisma.Decimal(balanceDue),
                balance: newBal,
                description: `Credit sale invoice ${invoiceNumber}`,
                referenceType: 'SALE',
                referenceId: sale.id,
                entryDate: sale.saleDate,
              },
            })
          }
        }

        if (h1Registers.length > 0) {
          const h1Data = h1Registers.map((r) => ({ ...r, saleId: sale.id }))
          await tx.scheduleH1Register.createMany({ data: h1Data })
        }

        if (narcoticRegisters.length > 0) {
          const narcData = narcoticRegisters.map((r) => ({ ...r, referenceId: sale.id }))
          await tx.narcoticRegister.createMany({ data: narcData })
        }

        await postGstTransactionForSale(sale.id, tx)

        for (const m of movements) {
          await tx.inventoryMovement.create({
            data: {
              inventoryId: m.inventoryId,
              type: 'OUT',
              quantity: m.quantity,
              quantityBefore: m.quantityBefore,
              quantityAfter: m.quantityAfter,
              referenceType: 'SALE',
              referenceId: sale.id,
              batchId: null,
              notes: `POS sale ${sale.invoiceNumber}`,
              createdById: actor.id,
            },
          })
        }

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'SALE_CREATE',
            entity: 'Sale',
            entityId: sale.id,
            metadata: {
              invoiceNumber: sale.invoiceNumber,
              totalAmount: totals.totalAmount,
              paymentStatus,
              itemCount: command.items.length,
            },
          },
        })

        return sale
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }
    )
  )
}


export async function cancelSale(
  saleId: string,
  reason: string,
  actor: SaleActor
): Promise<void> {
  const permissions = actor.permissions ?? []
  if (!permissions.includes(PERMISSIONS.SALES_VOID)) {
    throw new Error('Forbidden: requires permission sales:void')
  }

  await runWithRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: { include: { itemBatches: true } } },
        })
        if (!sale) throw new Error('Not Found: sale')
        if (sale.status === 'CANCELLED') throw new Error('Sale is already cancelled')
        
        await assertBranchAccess(actor, sale.branchId)

        await tx.sale.update({
          where: { id: saleId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledReason: reason,
          },
        })

        for (const item of sale.items) {
          const inv = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: item.productId, branchId: sale.branchId } },
          })
          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                totalQuantity: { increment: item.quantity },
                availableQuantity: { increment: item.quantity },
              },
            })

            await tx.inventoryMovement.create({
              data: {
                inventoryId: inv.id,
                type: 'RETURN_IN',
                quantity: item.quantity,
                quantityBefore: inv.availableQuantity,
                quantityAfter: inv.availableQuantity + item.quantity,
                referenceType: 'SALE',
                referenceId: sale.id,
                createdById: actor.id,
              },
            })
          }

          for (const ib of item.itemBatches) {
            await tx.batch.update({
              where: { id: ib.batchId },
              data: {
                soldQuantity: { decrement: ib.quantity },
              },
            })
          }
        }
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }
    )
  )
}
