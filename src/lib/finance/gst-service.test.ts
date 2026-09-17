import { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'

import {
  fileGstReturnPeriod,
  getGstr1Report,
  getGstr3bReport,
  postGstTransactionForPurchase,
  postGstTransactionForSale,
  syncMissingGstTransactions,
} from './gst-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    sale: { findUnique: jest.fn(), findMany: jest.fn() },
    purchase: { findUnique: jest.fn(), findMany: jest.fn() },
    gstTransaction: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    ledger: { count: jest.fn().mockResolvedValue(1) },
  },
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn().mockResolvedValue(true),
}))

const prismaMock = prisma as unknown as {
  sale: { findUnique: jest.Mock; findMany: jest.Mock }
  purchase: { findUnique: jest.Mock; findMany: jest.Mock }
  gstTransaction: {
    create: jest.Mock
    count: jest.Mock
    findMany: jest.Mock
    groupBy: jest.Mock
    aggregate: jest.Mock
    updateMany: jest.Mock
  }
  auditLog: { create: jest.Mock }
}

const mockActor = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@pharmacare.local',
  role: 'owner',
  branchId: 'br-1',
}

describe('GST Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('postGstTransactionForSale', () => {
    it('creates B2C transaction for walk-in customer', async () => {
      ;(prisma.sale.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sale-1',
        invoiceNumber: 'INV-2026-001',
        saleDate: new Date('2026-09-10'),
        branchId: 'br-1',
        customer: null,
        branch: { state: 'Karnataka' },
        items: [
          {
            hsnCode: '300490',
            taxPercent: new Prisma.Decimal(12),
            taxAmount: new Prisma.Decimal(12),
            totalAmount: new Prisma.Decimal(112),
            igstPercent: new Prisma.Decimal(0),
          },
        ],
      })
      ;(prisma.gstTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'gst-1' })

      const res = await postGstTransactionForSale('sale-1')
      expect(res).toHaveLength(1)
      expect(prismaMock.gstTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'B2C',
            referenceType: 'SALE',
            referenceId: 'sale-1',
            invoiceNumber: 'INV-2026-001',
            returnPeriod: '09-2026',
            cgstAmount: new Prisma.Decimal(6),
            sgstAmount: new Prisma.Decimal(6),
          }),
        })
      )
    })

    it('creates B2B transaction when customer has GSTIN', async () => {
      ;(prisma.sale.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sale-2',
        invoiceNumber: 'INV-2026-002',
        saleDate: new Date('2026-09-12'),
        branchId: 'br-1',
        customer: { name: 'Apollo Clinic', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' },
        branch: { state: 'Karnataka' },
        items: [
          {
            hsnCode: '300490',
            taxPercent: new Prisma.Decimal(18),
            taxAmount: new Prisma.Decimal(18),
            totalAmount: new Prisma.Decimal(118),
            igstPercent: new Prisma.Decimal(0),
          },
        ],
      })
      ;(prisma.gstTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'gst-2' })

      const res = await postGstTransactionForSale('sale-2')
      expect(res).toHaveLength(1)
      expect(prismaMock.gstTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'B2B',
            partyGstin: '29ABCDE1234F1Z5',
          }),
        })
      )
    })
  })

  describe('postGstTransactionForPurchase', () => {
    it('creates purchase ITC transaction', async () => {
      ;(prisma.purchase.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'po-1',
        purchaseNumber: 'PO-2026-001',
        invoiceNumber: 'SUP-INV-99',
        invoiceDate: new Date('2026-09-05'),
        createdAt: new Date('2026-09-05'),
        branchId: 'br-1',
        supplier: { name: 'Cipla Dist', gstin: '29CIPLA1234F1Z5', state: 'Karnataka' },
        branch: { state: 'Karnataka' },
        items: [
          {
            totalAmount: new Prisma.Decimal(1120),
            taxAmount: new Prisma.Decimal(120),
          },
        ],
      })
      ;(prisma.gstTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'gst-p-1' })

      const res = await postGstTransactionForPurchase('po-1')
      expect(res).toHaveLength(1)
      expect(prismaMock.gstTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referenceType: 'PURCHASE',
            referenceId: 'po-1',
            invoiceNumber: 'SUP-INV-99',
            taxableAmount: new Prisma.Decimal(1000),
            totalTax: new Prisma.Decimal(120),
          }),
        })
      )
    })
  })

  describe('syncMissingGstTransactions', () => {
    it('scans sales and purchases and syncs missing transactions', async () => {
      ;(prisma.sale.findMany as jest.Mock).mockResolvedValueOnce([{ id: 's-1' }])
      ;(prisma.gstTransaction.count as jest.Mock)
        .mockResolvedValueOnce(0) // s-1 missing
        .mockResolvedValueOnce(1) // p-1 exists
      ;(prisma.purchase.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'p-1' }])
      ;(prisma.sale.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 's-1',
        invoiceNumber: 'INV-1',
        saleDate: new Date('2026-09-10'),
        branchId: 'br-1',
        customer: null,
        branch: { state: 'KA' },
        items: [],
      })

      const res = await syncMissingGstTransactions({}, mockActor)
      expect(res.syncedSales).toBe(1)
      expect(res.syncedPurchases).toBe(0)
      expect(prismaMock.auditLog.create).toHaveBeenCalled()
    })
  })

  describe('Reports: GSTR-1 & GSTR-3B', () => {
    it('getGstr1Report formats b2b, b2c and hsn sections', async () => {
      ;(prisma.gstTransaction.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // b2b
        .mockResolvedValueOnce([]) // b2c
      ;(prisma.gstTransaction.groupBy as jest.Mock).mockResolvedValueOnce([])
      ;(prisma.gstTransaction.aggregate as jest.Mock).mockResolvedValueOnce({
        _count: 0,
        _sum: {
          taxableAmount: new Prisma.Decimal(0),
          cgstAmount: new Prisma.Decimal(0),
          sgstAmount: new Prisma.Decimal(0),
          igstAmount: new Prisma.Decimal(0),
          totalTax: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(0),
        },
      })

      const report = await getGstr1Report({ returnPeriod: '09-2026' }, mockActor)
      expect(report.returnPeriod).toBe('09-2026')
      expect(report.summary.transactionCount).toBe(0)
      expect(report.b2b).toEqual([])
    })

    it('getGstr3bReport aggregates outward taxable supplies and eligible itc', async () => {
      ;(prisma.gstTransaction.aggregate as jest.Mock)
        .mockResolvedValueOnce({
          _count: 10,
          _sum: {
            taxableAmount: new Prisma.Decimal(10000),
            cgstAmount: new Prisma.Decimal(600),
            sgstAmount: new Prisma.Decimal(600),
            igstAmount: new Prisma.Decimal(0),
            totalTax: new Prisma.Decimal(1200),
            totalAmount: new Prisma.Decimal(11200),
          },
        })
        .mockResolvedValueOnce({
          _count: 4,
          _sum: {
            taxableAmount: new Prisma.Decimal(4000),
            cgstAmount: new Prisma.Decimal(250),
            sgstAmount: new Prisma.Decimal(250),
            igstAmount: new Prisma.Decimal(0),
            totalTax: new Prisma.Decimal(500),
            totalAmount: new Prisma.Decimal(4500),
          },
        })

      const report = await getGstr3bReport({ returnPeriod: '09-2026' }, mockActor)
      expect(report.table31OutwardSupplies.taxableAmount).toBe(10000)
      expect(report.table4EligibleItc.totalTax).toBe(500)
      expect(report.table6PaymentOfTax.netTotalPayable).toBe(700)
    })

    it('fileGstReturnPeriod marks transactions filed and audits', async () => {
      ;(prisma.gstTransaction.updateMany as jest.Mock).mockResolvedValueOnce({ count: 15 })

      const res = await fileGstReturnPeriod({ returnPeriod: '09-2026' }, mockActor)
      expect(res.updatedCount).toBe(15)
      expect(prismaMock.gstTransaction.updateMany).toHaveBeenCalledWith({
        where: { returnPeriod: '09-2026', isFiled: false, branchId: 'br-1' },
        data: { isFiled: true },
      })
    })
  })
})
