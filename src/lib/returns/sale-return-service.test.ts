import { Prisma } from '@prisma/client'

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
    $transaction: jest.fn(),
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
    ledger: { count: jest.fn().mockResolvedValue(1) },
    customer: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customerLedger: {
      create: jest.fn(),
    },
    creditNote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
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
    narcoticRegister: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
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
  narcoticRegister: {
    findFirst: jest.Mock
    create: jest.Mock
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
  customer: {
    findUnique: jest.Mock
    update: jest.Mock
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
          product: { drugSchedule: 'GENERAL' },
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
      prismaMock.customer.findUnique.mockResolvedValue({
        outstandingBalance: new Prisma.Decimal(100),
      })
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

    it('writes a narcotic register entry for a narcotic RESTOCK return', async () => {
      const narcSale = {
        ...mockSale,
        items: [
          {
            ...mockSale.items[0],
            productId: 'prod-narc',
            product: { drugSchedule: 'NARCOTIC_NDPS' },
          },
        ],
      }
      prismaMock.sale.findUnique.mockResolvedValue(narcSale)
      prismaMock.saleReturn.create.mockResolvedValue({ id: 'ret-1' })
      prismaMock.inventory.upsert.mockResolvedValue({ id: 'inv-1', totalQuantity: 10 })
      prismaMock.narcoticRegister.findFirst.mockResolvedValue({ balanceQuantity: 90 })
      prismaMock.saleItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 3 },
      ])
      prismaMock.saleReturn.findUnique.mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'SR-1',
        status: 'REFUNDED',
      })

      await createSaleReturn(
        {
          saleId: 'sale-1',
          reason: 'Customer returned narcotic strip',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 3,
              restockDecision: 'RESTOCK',
              batchId: 'batch-1',
            },
          ],
        },
        mockActor
      )

      expect(prismaMock.narcoticRegister.create).toHaveBeenCalledWith({
        data: {
          branchId: 'branch-1',
          productId: 'prod-narc',
          batchId: 'batch-1',
          movementType: 'RETURN_TO_SUPPLIER',
          quantityIn: 3,
          quantityOut: 0,
          balanceQuantity: 93,
          referenceType: 'SALE_RETURN',
          referenceId: 'ret-1',
          enteredById: mockActor.id,
          entryDate: expect.any(Date),
        },
      })
    })

    it('aggregates multiple narcotic RESTOCK lines into one register entry', async () => {
      const narcSale = {
        ...mockSale,
        items: [
          {
            ...mockSale.items[0],
            id: 'item-1',
            productId: 'prod-narc',
            product: { drugSchedule: 'NARCOTIC_NDPS' },
          },
          {
            ...mockSale.items[0],
            id: 'item-2',
            productId: 'prod-narc',
            product: { drugSchedule: 'NARCOTIC_NDPS' },
          },
        ],
      }
      prismaMock.sale.findUnique.mockResolvedValue(narcSale)
      prismaMock.saleReturn.create.mockResolvedValue({ id: 'ret-1' })
      prismaMock.inventory.upsert.mockResolvedValue({ id: 'inv-1', totalQuantity: 10 })
      prismaMock.narcoticRegister.findFirst.mockResolvedValue({ balanceQuantity: 90 })
      prismaMock.saleItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 10, returnedQuantity: 2 },
        { id: 'item-2', quantity: 10, returnedQuantity: 1 },
      ])
      prismaMock.saleReturn.findUnique.mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'SR-1',
        status: 'REFUNDED',
      })

      await createSaleReturn(
        {
          saleId: 'sale-1',
          reason: 'Two strips returned',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 2,
              restockDecision: 'RESTOCK',
              batchId: 'batch-1',
            },
            {
              saleItemId: 'item-2',
              quantity: 1,
              restockDecision: 'RESTOCK',
              batchId: 'batch-1',
            },
          ],
        },
        mockActor
      )

      expect(prismaMock.narcoticRegister.create).toHaveBeenCalledTimes(1)
      expect(prismaMock.narcoticRegister.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-narc',
          batchId: 'batch-1',
          quantityIn: 3,
          balanceQuantity: 93,
        }),
      })
    })

    it('rejects a narcotic RESTOCK return without a resolvable batch', async () => {
      const narcSale = {
        ...mockSale,
        items: [
          {
            ...mockSale.items[0],
            productId: 'prod-narc',
            itemBatches: [],
            product: { drugSchedule: 'NARCOTIC_NDPS' },
          },
        ],
      }
      prismaMock.sale.findUnique.mockResolvedValue(narcSale)

      await expect(
        createSaleReturn(
          {
            saleId: 'sale-1',
            reason: 'Return',
            refundMethod: 'CASH',
            items: [{ saleItemId: 'item-1', quantity: 1, restockDecision: 'RESTOCK' }],
          },
          mockActor
        )
      ).rejects.toThrow('Batch ID is required for narcotic customer returns')
      expect(prismaMock.saleReturn.create).not.toHaveBeenCalled()
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

      const res = await listCreditNotes(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
        mockActor
      )
      expect(res.data).toHaveLength(1)
      expect(res.pagination.total).toBe(1)
    })

    it('fetches a credit note by ID', async () => {
      const mockCN = {
        id: 'cn-1',
        amount: 100,
        saleReturn: { sale: { branchId: 'branch-1' } },
      }
      prismaMock.creditNote.findUnique.mockResolvedValue(mockCN)

      const res = await getCreditNoteById('cn-1', mockActor)
      expect(res).toEqual(mockCN)
    })
  })
})
