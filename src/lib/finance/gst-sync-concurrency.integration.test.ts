/**
 * @jest-environment node
 */
/* eslint-disable */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from '@jest/globals'

import prisma from '@/lib/db/prisma'
import {
  syncMissingGstTransactions,
  postGstTransactionForSale,
  postGstTransactionForPurchase,
} from '@/lib/finance/gst-service'
import type { AuthUser } from '@/lib/inventory/branch-access'

describe('GST Sync Concurrency / Uniqueness (Real Postgres)', () => {
  let actor: AuthUser
  let branchId: string
  let orgId: string
  let saleId: string
  let saleItemIds: string[]
  let purchaseId: string
  let purchaseItemIds: string[]

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'GST Sync Org' } })
    orgId = org.id
    const branch = await prisma.branch.create({
      data: { name: 'GST Sync Branch', organizationId: org.id, state: 'DL' },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: { name: 'GST Sync User', email: `gst-sync-${Date.now()}@example.com`, branchId },
    })
    actor = { id: user.id, branchId: branch.id, role: 'ADMIN' } as AuthUser

    // Create a customer for the sale
    const customer = await prisma.customer.create({
      data: { name: 'GST Sync Customer', gstin: '29AAAAA0000A1Z5', state: 'KA' },
    })

    // Create a product
    const product = await prisma.product.create({
      data: {
        name: 'GST Sync Product',
        sku: `GST-SYNC-${Date.now()}`,
        barcode: `890100${Date.now().toString().slice(-6)}`,
        mrp: 100,
        gstRate: 18,
        cgstRate: 9,
        sgstRate: 9,
        unitOfMeasure: 'Strip',
        createdById: user.id,
      },
    })

    // Create a sale with 2 line items
    const sale = await prisma.sale.create({
      data: {
        branchId,
        customerId: customer.id,
        invoiceNumber: `INV-SYNC-${Date.now()}`,
        subtotal: 200,
        taxAmount: 36,
        totalAmount: 236,
        amountPaid: 236,
        status: 'COMPLETED',
        saleDate: new Date(),
        createdById: user.id,
        items: {
          create: [
            {
              productId: product.id,
              productName: 'GST Sync Product',
              productSku: 'GST-SYNC-001',
              mrp: 100,
              quantity: 1,
              unitPrice: 100,
              discountPercent: 0,
              discountAmount: 0,
              taxPercent: 18,
              cgstPercent: 9,
              sgstPercent: 9,
              igstPercent: 0,
              taxAmount: 18,
              totalAmount: 118,
              hsnCode: '3004',
            },
            {
              productId: product.id,
              productName: 'GST Sync Product',
              productSku: 'GST-SYNC-002',
              mrp: 100,
              quantity: 1,
              unitPrice: 100,
              discountPercent: 0,
              discountAmount: 0,
              taxPercent: 18,
              cgstPercent: 9,
              sgstPercent: 9,
              igstPercent: 0,
              taxAmount: 18,
              totalAmount: 118,
              hsnCode: '3004',
            },
          ],
        },
      },
      include: { items: true },
    })
    saleId = sale.id
    saleItemIds = sale.items.map((i) => i.id)

    // Create a supplier for purchase
    const supplier = await prisma.supplier.create({
      data: {
        name: 'GST Sync Supplier',
        state: 'MH',
        creditDays: 30,
        outstandingBalance: 0,
        isActive: true,
      },
    })

    // Create a purchase with 2 line items
    const purchase = await prisma.purchase.create({
      data: {
        branchId,
        supplierId: supplier.id,
        purchaseNumber: `PO-SYNC-${Date.now()}`,
        invoiceNumber: `PINV-SYNC-${Date.now()}`,
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 36,
        totalAmount: 236,
        balanceDue: 236,
        status: 'RECEIVED',
        expectedDate: new Date(),
        createdById: user.id,
        items: {
          create: [
            {
              productId: product.id,
              orderedQuantity: 10,
              receivedQuantity: 10,
              unitCost: 50,
              discountPercent: 0,
              taxPercent: 18,
              taxAmount: 90,
              totalAmount: 590,
              mrp: 100,
            },
            {
              productId: product.id,
              orderedQuantity: 10,
              receivedQuantity: 10,
              unitCost: 50,
              discountPercent: 0,
              taxPercent: 18,
              taxAmount: 90,
              totalAmount: 590,
              mrp: 100,
            },
          ],
        },
      },
      include: { items: true },
    })
    purchaseId = purchase.id
    purchaseItemIds = purchase.items.map((i) => i.id)
  })

  afterAll(async () => {
    await prisma.gstTransaction.deleteMany({ where: { branchId } })
    await prisma.saleItem.deleteMany({ where: { saleId } })
    await prisma.sale.delete({ where: { id: saleId } })
    await prisma.purchaseItem.deleteMany({ where: { purchaseId } })
    await prisma.purchase.delete({ where: { id: purchaseId } })
    await prisma.supplier.deleteMany({ where: { name: 'GST Sync Supplier' } })
    await prisma.customer.delete({
      where: {
        id: (await prisma.customer.findFirst({ where: { name: 'GST Sync Customer' } }))?.id,
      },
    })
    await prisma.product.deleteMany({ where: { name: 'GST Sync Product' } })
    await prisma.user.delete({ where: { id: actor.id } })
    await prisma.branch.delete({ where: { id: branchId } })
    await prisma.organization.delete({ where: { id: orgId } })
  })

  beforeEach(async () => {
    // Clean up GST transactions before each test
    await prisma.gstTransaction.deleteMany({ where: { branchId } })
  })

  it('prevents duplicate GST transactions for sale lines via unique constraint', async () => {
    // First sync - creates GST transactions for all sale lines
    await syncMissingGstTransactions({ branchId }, actor)

    // Verify 2 GST transactions created (one per line item)
    const txs1 = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE', referenceId: saleId },
    })
    expect(txs1).toHaveLength(2)

    // Second sync - should NOT create duplicates due to unique constraint
    // and should report 0 synced sales
    const result = await syncMissingGstTransactions({ branchId }, actor)
    expect(result.syncedSales).toBe(0)

    // Verify still only 2 GST transactions
    const txs2 = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE', referenceId: saleId },
    })
    expect(txs2).toHaveLength(2)

    // Each transaction should have unique referenceLineId
    const lineIds = txs2.map((t) => t.referenceLineId).sort()
    expect(lineIds).toEqual(saleItemIds.sort())
  })

  it('prevents duplicate GST transactions for purchase lines via unique constraint', async () => {
    // First sync - creates GST transactions for all purchase lines
    await syncMissingGstTransactions({ branchId }, actor)

    // Verify 2 GST transactions created (one per line item)
    const txs1 = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchaseId },
    })
    expect(txs1).toHaveLength(2)

    // Second sync - should NOT create duplicates due to unique constraint
    const result = await syncMissingGstTransactions({ branchId }, actor)
    expect(result.syncedPurchases).toBe(0)

    // Verify still only 2 GST transactions
    const txs2 = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchaseId },
    })
    expect(txs2).toHaveLength(2)

    // Each transaction should have unique referenceLineId
    const lineIds = txs2.map((t) => t.referenceLineId).sort()
    expect(lineIds).toEqual(purchaseItemIds.sort())
  })

  it('postGstTransactionForSale populates referenceLineId correctly', async () => {
    await postGstTransactionForSale(saleId)

    const txs = await prisma.gstTransaction.findMany({
      where: { referenceType: 'SALE', referenceId: saleId },
      orderBy: { referenceLineId: 'asc' },
    })
    expect(txs).toHaveLength(2)

    // Verify referenceLineId matches sale item IDs
    const lineIds = txs.map((t) => t.referenceLineId).sort()
    expect(lineIds).toEqual(saleItemIds.sort())

    // Verify all required fields
    for (const tx of txs) {
      expect(tx.referenceLineId).toBeDefined()
      expect(tx.referenceType).toBe('SALE')
      expect(tx.referenceId).toBe(saleId)
    }
  })

  it('postGstTransactionForPurchase populates referenceLineId correctly', async () => {
    await postGstTransactionForPurchase(purchaseId)

    const txs = await prisma.gstTransaction.findMany({
      where: { referenceType: 'PURCHASE', referenceId: purchaseId },
      orderBy: { referenceLineId: 'asc' },
    })
    expect(txs).toHaveLength(2)

    // Verify referenceLineId matches purchase item IDs
    const lineIds = txs.map((t) => t.referenceLineId).sort()
    expect(lineIds).toEqual(purchaseItemIds.sort())

    // Verify all required fields
    for (const tx of txs) {
      expect(tx.referenceLineId).toBeDefined()
      expect(tx.referenceType).toBe('PURCHASE')
      expect(tx.referenceId).toBe(purchaseId)
    }
  })

  it('enforces uniqueness at database level - concurrent insert throws P2002', async () => {
    await postGstTransactionForSale(saleId)

    // Try to insert a duplicate with same referenceType, referenceId, referenceLineId
    const firstTx = await prisma.gstTransaction.findFirst({
      where: { referenceType: 'SALE', referenceId: saleId },
      orderBy: { referenceLineId: 'asc' },
    })

    await expect(
      prisma.gstTransaction.create({
        data: {
          branchId,
          type: 'B2B',
          referenceType: 'SALE',
          referenceId: saleId,
          referenceLineId: firstTx!.referenceLineId,
          invoiceNumber: 'DUPLICATE',
          invoiceDate: new Date(),
          partyName: 'Test',
          taxableAmount: 100,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          totalTax: 18,
          totalAmount: 118,
          returnPeriod: '09-2026',
          isFiled: false,
        },
      })
    ).rejects.toThrow(/P2002|Unique constraint/)
  })
})
