import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import {
  createSaleReturn,
  generateCreditNoteNumber,
  generateReturnNumber,
  getCreditNoteById,
  getSaleReturnById,
  listCreditNotes,
  listSaleReturns,
} from '@/lib/returns/sale-return-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    sale: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    saleItem: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    saleReturn: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    inventory: {
      upsert: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
    batch: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    creditNote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    customerLedger: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  sale: {
    findUnique: jest.Mock
    update: jest.Mock
  }
  saleItem: {
    update: jest.Mock
    findMany: jest.Mock
  }
  saleReturn: {
    create: jest.Mock
    findUnique: jest.Mock
    findMany: jest.Mock
    count: jest.Mock
  }
  inventory: {
    upsert: jest.Mock
  }
  inventoryMovement: {
    create: jest.Mock
  }
  batch: {
    findUnique: jest.Mock
    update: jest.Mock
  }
  creditNote: {
    create: jest.Mock
    findUnique: jest.Mock
    findMany: jest.Mock
    count: jest.Mock
  }
  customerLedger: {
    create: jest.Mock
  }
  auditLog: {
    create: jest.Mock
  }
  $transaction: jest.Mock
}

const mockActor = {
  id: 'user-pharma-1',
  branchId: 'branch-1',
  permissions: ['returns:read', 'returns:create'],
}

describe('Sale Return Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof prismaMock) => Promise<T>): Promise<T> => {
        return cb(prismaMock)
      }
    )
  })

  describe('number generators', () => {
    it('generates properly formatted return and credit note numbers', () => {
      const ret = generateReturnNumber(new Date(2026, 8, 15))
      expect(ret).toMatch(/^SR-20260915-\d{4}$/)

      const cn = generateCreditNoteNumber(new Date(2026, 8, 15))
      expect(cn).toMatch(/^CN-20260915-\d{4}$/)
    })
  })

  describe('createSaleReturn', () => {
    const mockSale = {
      id: 'sale-1',
      invoiceNumber: 'INV-BR-0001',
      branchId: 'branch-1',
      status: 'COMPLETED',
      customerId: 'cust-1',
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'Paracetamol 500mg',
          quantity: 10,
          returnedQuantity: 0,
          unitPrice: 10,
          totalAmount: 100,
          itemBatches: [{ batchId: 'batch-1', quantity: 10 }],
        },
      ],
      customer: { id: 'cust-1', name: 'John Doe' },
    }

    it('processes partial return and restocks inventory', async () => {
      prismaMock.sale.findUnique.mockResolvedValue(mockSale)
      prismaMock.saleReturn.create.mockResolvedValue({ id: 'ret-1' })
      prismaMock.inventory.upsert.mockResolvedValue({ id: 'inv-1', totalQuantity: 10 })
      prismaMock.saleItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 3 },
      ])
      const mockReturnRecord = { id: 'ret-1', returnNumber: 'SR-1', status: 'REFUNDED' }
      prismaMock.saleReturn.findUnique.mockResolvedValue(mockReturnRecord)

      const result = await createSaleReturn(
        {
          saleId: 'sale-1',
          reason: 'Customer did not need full strip',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 3,
              restockDecision: 'RESTOCK',
            },
          ],
        },
        mockActor
      )

      expect(assertBranchAccess).toHaveBeenCalledWith(mockActor, 'branch-1')
      expect(prismaMock.saleItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { returnedQuantity: { increment: 3 } },
      })
      expect(prismaMock.inventory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { totalQuantity: { increment: 3 }, availableQuantity: { increment: 3 } },
        })
      )
      expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'RETURN_IN', quantity: 3 }),
        })
      )
      expect(prismaMock.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: { status: 'PARTIALLY_RETURNED' },
      })
      expect(result).toEqual(mockReturnRecord)
    })

    it('marks sale as FULLY_RETURNED and creates credit note when method is CREDIT', async () => {
      prismaMock.sale.findUnique.mockResolvedValue(mockSale)
      prismaMock.saleReturn.create.mockResolvedValue({ id: 'ret-1' })
      prismaMock.inventory.upsert.mockResolvedValue({ id: 'inv-1', totalQuantity: 10 })
      prismaMock.creditNote.create.mockResolvedValue({ id: 'cn-1' })
      prismaMock.customerLedger.create.mockResolvedValue({ id: 'ledger-1' })
      prismaMock.saleItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 10 },
      ])
      const mockReturnRecord = { id: 'ret-1', returnNumber: 'SR-1', status: 'CREDITED' }
      prismaMock.saleReturn.findUnique.mockResolvedValue(mockReturnRecord)

      await createSaleReturn(
        {
          saleId: 'sale-1',
          reason: 'All items returned',
          refundMethod: 'CREDIT',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 10,
              restockDecision: 'RESTOCK',
            },
          ],
        },
        mockActor
      )

      expect(prismaMock.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: { status: 'FULLY_RETURNED' },
      })
      expect(prismaMock.creditNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            saleReturnId: 'ret-1',
            customerId: 'cust-1',
            amount: 100,
            status: 'ACTIVE',
          }),
        })
      )
      expect(prismaMock.customerLedger.create).toHaveBeenCalled()
    })

    it('rejects return exceeding unreturned quantity', async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        ...mockSale,
        items: [{ ...mockSale.items[0], returnedQuantity: 8 }],
      })

      await expect(
        createSaleReturn(
          {
            saleId: 'sale-1',
            reason: 'Excess return',
            refundMethod: 'CASH',
            items: [{ saleItemId: 'item-1', quantity: 5, restockDecision: 'RESTOCK' }],
          },
          mockActor
        )
      ).rejects.toThrow(/only 2 units remain unreturned/)
    })

    it('rejects return for cancelled sales', async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        ...mockSale,
        status: 'CANCELLED',
      })

      await expect(
        createSaleReturn(
          {
            saleId: 'sale-1',
            reason: 'Try return',
            refundMethod: 'CASH',
            items: [{ saleItemId: 'item-1', quantity: 1, restockDecision: 'RESTOCK' }],
          },
          mockActor
        )
      ).rejects.toThrow('Cannot return items for a cancelled sale')
    })
  })

  describe('getSaleReturnById', () => {
    it('returns sale return when found and authorized', async () => {
      const mockRet = { id: 'ret-1', sale: { branchId: 'branch-1' } }
      prismaMock.saleReturn.findUnique.mockResolvedValue(mockRet)

      const res = await getSaleReturnById('ret-1', mockActor)
      expect(res).toEqual(mockRet)
      expect(assertBranchAccess).toHaveBeenCalledWith(mockActor, 'branch-1')
    })

    it('throws Not Found when record does not exist', async () => {
      prismaMock.saleReturn.findUnique.mockResolvedValue(null)
      await expect(getSaleReturnById('unknown', mockActor)).rejects.toThrow(
        'Not Found: sale return'
      )
    })
  })

  describe('listSaleReturns', () => {
    it('lists sale returns with pagination and branch scoping', async () => {
      prismaMock.saleReturn.findMany.mockResolvedValue([{ id: 'ret-1' }])
      prismaMock.saleReturn.count.mockResolvedValue(1)

      const res = await listSaleReturns(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
        mockActor
      )
      expect(res.data).toHaveLength(1)
      expect(res.pagination.total).toBe(1)
    })
  })

  describe('listCreditNotes and getCreditNoteById', () => {
    it('lists credit notes with pagination', async () => {
      prismaMock.creditNote.findMany.mockResolvedValue([{ id: 'cn-1' }])
      prismaMock.creditNote.count.mockResolvedValue(1)

      const res = await listCreditNotes({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }, mockActor)
      expect(res.data).toHaveLength(1)
      expect(res.pagination.total).toBe(1)
    })

    it('fetches a credit note by ID', async () => {
      const mockCN = { id: 'cn-1', amount: 100 }
      prismaMock.creditNote.findUnique.mockResolvedValue(mockCN)

      const res = await getCreditNoteById('cn-1', mockActor)
      expect(res).toEqual(mockCN)
    })
  })
})
