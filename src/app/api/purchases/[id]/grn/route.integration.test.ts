/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// GRN route — real-openai-mail-time contract against real PostgreSQL.
//
// The GRN receive page (src/app/(dashboard)/purchases/[id]/receive/page.tsx)
// collects dates from <input type="date"> as YYYY-MM-DD and normalizes them to
// ISO 8601 datetimes (z.string().datetime({ offset: true })) before POSTing to
// /api/purchases/:id/grn. This suite drives the real route handler with that
// exact payload shape against the isolated pharmacare_test database, mocking
// only requirePermission (auth/RBAC). The route parse -> createGrn service ->
// Prisma transaction -> PostgreSQL -> response -> state effects are all real.
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'

import { POST as grnPOST } from '@/app/api/purchases/[id]/grn/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import prisma from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

const mockRequirePermission = requirePermission as jest.Mock

const TRUNCATE_TABLES = [
  'gst_transactions',
  'supplier_ledgers',
  'suppliers',
  'purchase_items',
  'purchases',
  'batch_status_log',
  'batches',
  'inventory_movements',
  'inventory',
  'product_barcodes',
  'products',
  'audit_logs',
]

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) })
}

describe('GRN route integration (Real PostgreSQL)', () => {
  let branchId: string
  let actor: { id: string; branchId: string }
  let productId: string
  let supplierId: string
  let purchaseId: string
  let itemId: string

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    const org = await prisma.organization.create({ data: { name: 'GRN Route Org' } })
    const branch = await prisma.branch.create({
      data: {
        name: 'GRN Route Branch',
        organizationId: org.id,
        code: 'GRN-ROUTE',
        invoicePrefix: 'GRNINV',
      },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: { name: 'GRN Route User', email: `grn-route-${Date.now()}@pharma.test`, branchId },
    })
    actor = { id: user.id, branchId }
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    mockRequirePermission.mockClear()
    mockRequirePermission.mockResolvedValue(actor)

    const product = await prisma.product.create({
      data: {
        name: 'GRN Route Paracetamol',
        sku: `GRN-P-${Date.now()}`,
        barcode: `GRNB-${Date.now()}`,
        mrp: 100,
        gstRate: 12,
        cgstRate: 6,
        sgstRate: 6,
        unitOfMeasure: 'Strip',
        drugSchedule: 'NONE',
        storageCondition: 'ROOM_TEMPERATURE',
        createdById: actor.id,
      },
    })
    productId = product.id

    const supplier = await prisma.supplier.create({
      data: { name: 'GRN Route Supplier', creditDays: 30, outstandingBalance: 0, isActive: true },
    })
    supplierId = supplier.id

    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber: `GRN-PO-${Date.now()}`,
        branchId,
        supplierId,
        purchaseDate: new Date(),
        status: 'ORDERED',
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1000,
        amountPaid: 0,
        balanceDue: 1000,
        createdById: actor.id,
      },
    })
    purchaseId = purchase.id

    const item = await prisma.purchaseItem.create({
      data: {
        purchaseId,
        productId,
        orderedQuantity: 100,
        receivedQuantity: 0,
        unitCost: 10,
        mrp: 100,
        discountPercent: 0,
        taxPercent: 0,
        taxAmount: 0,
        totalAmount: 1000,
      },
    })
    itemId = item.id
  })

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    await prisma.$disconnect()
  })

  // Mirror the fixed receive page: <input type="date"> yields YYYY-MM-DD,
  // which the page normalizes to new Date(value).toISOString() before POST.
  function pagePayload(dateStyle: 'iso' | 'date-only' | 'garbage') {
    const grnDateOnly = new Date().toISOString().split('T')[0]
    const expiryDateOnly = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const grnDate =
      dateStyle === 'iso'
        ? new Date(grnDateOnly).toISOString()
        : dateStyle === 'garbage'
          ? 'not-a-date'
          : grnDateOnly
    const expiryDate =
      dateStyle === 'iso'
        ? new Date(expiryDateOnly).toISOString()
        : dateStyle === 'garbage'
          ? 'also-not-a-date'
          : expiryDateOnly

    return {
      purchaseId,
      branchId,
      grnNumber: `GRN-${Date.now()}`,
      grnDate,
      items: [
        {
          purchaseItemId: itemId,
          receivedQuantity: 100,
          batchNumber: `BT-GRN-${Date.now()}`,
          expiryDate,
          purchasePrice: 10,
          mrp: 100,
          qualityCheckPassed: true,
        },
      ],
    }
  }

  it('receives a full GRN through the real route with the normalized ISO payload (201)', async () => {
    const payload = pagePayload('iso')
    const res = await grnPOST(post(`http://localhost/api/purchases/${purchaseId}/grn`, payload), {
      params: { id: purchaseId },
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.grn.grnNumber).toBe(payload.grnNumber)
    expect(body.data.purchase.status).toBe('RECEIVED')
  })

  it('persists correct purchase, item, batch, inventory, movement, ledger, GST, and audit state', async () => {
    const payload = pagePayload('iso')
    const res = await grnPOST(post(`http://localhost/api/purchases/${purchaseId}/grn`, payload), {
      params: { id: purchaseId },
    })
    expect(res.status).toBe(201)

    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } })
    expect(purchase?.status).toBe('RECEIVED')
    expect(purchase?.receivedAt?.toISOString()).toBe(payload.grnDate)

    const item = await prisma.purchaseItem.findUnique({ where: { id: itemId } })
    expect(item?.receivedQuantity).toBe(100)

    const batch = await prisma.batch.findUnique({
      where: { productId_batchNumber: { productId, batchNumber: payload.items[0].batchNumber } },
    })
    expect(batch).not.toBeNull()
    expect(batch?.quantity).toBe(100)
    expect(batch?.status).toBe('ACTIVE')
    expect(batch?.branchId).toBe(branchId)
    expect(batch?.purchaseId).toBe(purchaseId)
    expect(batch?.expiryDate.toISOString()).toBe(payload.items[0].expiryDate)
    expect(batch?.manufacturingDate).toBeNull()

    const inventory = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
    })
    expect(inventory?.totalQuantity).toBe(100)
    expect(inventory?.availableQuantity).toBe(100)
    expect(inventory?.reservedQuantity).toBe(0)

    const movement = await prisma.inventoryMovement.findFirst({ where: { type: 'IN' } })
    expect(movement).not.toBeNull()
    expect(movement?.referenceType).toBe('GRN')
    expect(movement?.quantity).toBe(100)
    expect(movement?.quantityBefore).toBe(0)
    expect(movement?.quantityAfter).toBe(100)
    expect(movement?.batchId).toBe(batch?.id)

    const ledger = await prisma.supplierLedger.findFirst({ where: { type: 'DEBIT' } })
    expect(ledger?.amount.toNumber()).toBe(1000)
    expect(ledger?.entryDate.toISOString()).toBe(payload.grnDate)

    const gst = await prisma.gstTransaction.findFirst({
      where: { referenceType: 'PURCHASE', referenceId: purchaseId },
    })
    expect(gst).not.toBeNull()
    expect(gst?.type).toBe('B2B')

    const audit = await prisma.auditLog.findFirst({ where: { action: 'GRN_CREATE' } })
    expect(audit?.entityId).toBe(purchaseId)
    expect(audit?.metadata).toMatchObject({
      grnNumber: payload.grnNumber,
      purchaseId,
    })
  })

  it('rejects the old date-only YYYY-MM-DD payload with 400 and no state change', async () => {
    const payload = pagePayload('date-only')
    const res = await grnPOST(post(`http://localhost/api/purchases/${purchaseId}/grn`, payload), {
      params: { id: purchaseId },
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION')

    expect((await prisma.purchase.findUnique({ where: { id: purchaseId } }))?.status).toBe(
      'ORDERED'
    )
    expect(await prisma.batch.count()).toBe(0)
    expect(await prisma.inventory.count()).toBe(0)
    expect(await prisma.inventoryMovement.count()).toBe(0)
  })

  it('rejects non-datetime garbage values with 400', async () => {
    const payload = pagePayload('garbage')
    const res = await grnPOST(post(`http://localhost/api/purchases/${purchaseId}/grn`, payload), {
      params: { id: purchaseId },
    })

    expect(res.status).toBe(400)
    expect((await prisma.purchase.findUnique({ where: { id: purchaseId } }))?.status).toBe(
      'ORDERED'
    )
  })
})
