import { Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'

import {
  createLedger,
  getCustomerLedgerStatement,
  getFinanceSummary,
  getLedgerById,
  getSupplierLedgerStatement,
  listLedgers,
  recordCustomerPayment,
  recordSupplierPayment,
} from './finance-service'

jest.mock('@/lib/db/prisma', () => {
  const mockClient = {
    sale: { aggregate: jest.fn() },
    purchase: { aggregate: jest.fn() },
    customer: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    supplier: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: { aggregate: jest.fn(), create: jest.fn() },
    ledger: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    ledgerEntry: { create: jest.fn() },
    customerLedger: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    supplierLedger: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown): unknown => cb(mockClient)),
  }
  return {
    __esModule: true,
    default: mockClient,
  }
})

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn().mockResolvedValue(true),
}))

const prismaMock = prisma as unknown as {
  sale: { aggregate: jest.Mock }
  purchase: { aggregate: jest.Mock }
  customer: {
    aggregate: jest.Mock
    findMany: jest.Mock
    count: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
  }
  supplier: {
    aggregate: jest.Mock
    findMany: jest.Mock
    count: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
  }
  payment: { aggregate: jest.Mock; create: jest.Mock }
  ledger: {
    count: jest.Mock
    findMany: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
    upsert: jest.Mock
  }
  ledgerEntry: { create: jest.Mock }
  customerLedger: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock }
  supplierLedger: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock }
  auditLog: { create: jest.Mock }
}

const mockActor = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@pharmacare.local',
  role: 'owner',
  branchId: 'br-1',
}

describe('Finance Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getFinanceSummary', () => {
    it('aggregates sales, purchases, party dues and cash correctly', async () => {
      ;(prisma.sale.aggregate as jest.Mock).mockResolvedValueOnce({
        _sum: {
          totalAmount: new Prisma.Decimal(50000),
          taxAmount: new Prisma.Decimal(6000),
          amountPaid: new Prisma.Decimal(45000),
        },
      })
      ;(prisma.purchase.aggregate as jest.Mock).mockResolvedValueOnce({
        _sum: { totalAmount: new Prisma.Decimal(30000), taxAmount: new Prisma.Decimal(3600) },
      })
      ;(prisma.customer.aggregate as jest.Mock).mockResolvedValueOnce({
        _sum: { outstandingBalance: new Prisma.Decimal(5000) },
      })
      ;(prisma.supplier.aggregate as jest.Mock).mockResolvedValueOnce({
        _sum: { outstandingBalance: new Prisma.Decimal(8000) },
      })
      ;(prisma.payment.aggregate as jest.Mock).mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal(45000) },
      })

      const summary = await getFinanceSummary({ branchId: 'br-1' }, mockActor)

      expect(summary.sales).toBe(50000)
      expect(summary.purchases).toBe(30000)
      expect(summary.customerReceivables).toBe(5000)
      expect(summary.supplierPayables).toBe(8000)
      expect(summary.taxCollected).toBe(6000)
      expect(summary.taxPaid).toBe(3600)
      expect(summary.netGstPayable).toBe(2400)
    })
  })

  describe('Ledger Operations', () => {
    it('listLedgers returns paginated ledgers', async () => {
      ;(prisma.ledger.count as jest.Mock).mockResolvedValue(10)
      ;(prisma.ledger.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'l-1',
          code: '1010',
          name: 'Cash on Hand',
          type: 'ASSET',
          balance: new Prisma.Decimal(12500),
          parent: null,
          _count: { entries: 5 },
        },
      ])

      const res = await listLedgers({ page: 1, limit: 10 })
      expect(res.data).toHaveLength(1)
      expect(res.data[0].code).toBe('1010')
      expect(res.pagination.total).toBe(10)
    })

    it('getLedgerById fetches ledger details and entries', async () => {
      ;(prisma.ledger.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'l-1',
        code: '1010',
        name: 'Cash on Hand',
        type: 'ASSET',
        balance: new Prisma.Decimal(1000),
        parent: null,
        children: [],
        entries: [],
        _count: { entries: 0 },
      })

      const ledger = await getLedgerById('l-1')
      expect(ledger.id).toBe('l-1')
      expect(ledger.name).toBe('Cash on Hand')
    })

    it('createLedger creates account with opening balance entry', async () => {
      const mockCreated = {
        id: 'l-new',
        code: '1099',
        name: 'Investments',
        type: 'ASSET',
        balance: new Prisma.Decimal(20000),
      }
      ;(prisma.ledger.create as jest.Mock).mockResolvedValueOnce(mockCreated)

      const res = await createLedger(
        { code: '1099', name: 'Investments', type: 'ASSET', openingBalance: 20000 },
        mockActor
      )

      expect(res.id).toBe('l-new')
      expect(prismaMock.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ledgerId: 'l-new',
            type: 'DEBIT',
          }),
        })
      )
    })
  })

  describe('Receivables & Customer Payments', () => {
    it('getCustomerLedgerStatement returns statement', async () => {
      ;(prisma.customer.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'cust-1',
        name: 'John Doe',
        phone: '9876543210',
        outstandingBalance: new Prisma.Decimal(1200),
        creditLimit: new Prisma.Decimal(5000),
      })
      ;(prisma.customerLedger.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'cle-1',
          type: 'DEBIT',
          amount: new Prisma.Decimal(1200),
          balance: new Prisma.Decimal(1200),
          description: 'Invoice INV-001',
          referenceType: 'SALE',
          referenceId: 'sale-1',
          entryDate: new Date('2026-09-01'),
          createdAt: new Date('2026-09-01'),
        },
      ])
      ;(prisma.customerLedger.count as jest.Mock).mockResolvedValueOnce(1)

      const res = await getCustomerLedgerStatement('cust-1')
      expect(res.customer.name).toBe('John Doe')
      expect(res.customer.outstandingBalance).toBe(1200)
      expect(res.entries).toHaveLength(1)
    })

    it('recordCustomerPayment reduces balance and records CREDIT ledger entry', async () => {
      ;(prisma.customer.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'cust-1',
        name: 'John Doe',
        outstandingBalance: new Prisma.Decimal(1200),
      })
      ;(prisma.payment.create as jest.Mock).mockResolvedValueOnce({
        id: 'pay-1',
        amount: new Prisma.Decimal(500),
        method: 'UPI',
        reference: 'UPI-123',
        paymentDate: new Date(),
      })
      ;(prisma.customerLedger.create as jest.Mock).mockResolvedValueOnce({
        id: 'cle-2',
        type: 'CREDIT',
        amount: new Prisma.Decimal(500),
        balance: new Prisma.Decimal(700),
        entryDate: new Date(),
      })
      ;(prisma.ledger.findUnique as jest.Mock).mockResolvedValue(null)

      const res = await recordCustomerPayment(
        'cust-1',
        { amount: 500, paymentMethod: 'UPI', reference: 'UPI-123' },
        mockActor
      )

      expect(res.newBalance).toBe(700)
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { outstandingBalance: new Prisma.Decimal(700) },
      })
    })
  })

  describe('Payables & Supplier Payments', () => {
    it('getSupplierLedgerStatement returns supplier statement', async () => {
      ;(prisma.supplier.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sup-1',
        name: 'Pharma Dist Ltd',
        phone: '9123456789',
        outstandingBalance: new Prisma.Decimal(8500),
      })
      ;(prisma.supplierLedger.findMany as jest.Mock).mockResolvedValueOnce([])
      ;(prisma.supplierLedger.count as jest.Mock).mockResolvedValueOnce(0)

      const res = await getSupplierLedgerStatement('sup-1')
      expect(res.supplier.name).toBe('Pharma Dist Ltd')
      expect(res.supplier.outstandingBalance).toBe(8500)
    })

    it('recordSupplierPayment reduces supplier balance and records DEBIT entry', async () => {
      ;(prisma.supplier.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sup-1',
        name: 'Pharma Dist Ltd',
        outstandingBalance: new Prisma.Decimal(8500),
      })
      ;(prisma.payment.create as jest.Mock).mockResolvedValueOnce({
        id: 'pay-sup-1',
        amount: new Prisma.Decimal(3500),
        method: 'NETBANKING',
        reference: 'NEFT-888',
        paymentDate: new Date(),
      })
      ;(prisma.supplierLedger.create as jest.Mock).mockResolvedValueOnce({
        id: 'sle-1',
        type: 'DEBIT',
        amount: new Prisma.Decimal(3500),
        balance: new Prisma.Decimal(5000),
        entryDate: new Date(),
      })
      ;(prisma.ledger.findUnique as jest.Mock).mockResolvedValue(null)

      const res = await recordSupplierPayment(
        'sup-1',
        { amount: 3500, paymentMethod: 'NETBANKING', reference: 'NEFT-888' },
        mockActor
      )

      expect(res.newBalance).toBe(5000)
      expect(prismaMock.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
        data: { outstandingBalance: new Prisma.Decimal(5000) },
      })
    })
  })
})
