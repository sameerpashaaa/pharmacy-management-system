import {
  blockBatch,
  createBatch,
  disposeBatch,
  expireDueBatches,
  getBatchById,
  getBatches,
  updateBatch,
} from '@/lib/batches/batch-service'
import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    batch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    batchStatusLog: { create: jest.fn() },
    batchDisposal: { create: jest.fn() },
    product: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  batch: {
    findMany: jest.Mock
    findUnique: jest.Mock
    findFirst: jest.Mock
    findUniqueOrThrow: jest.Mock
    create: jest.Mock
    updateMany: jest.Mock
    count: jest.Mock
  }
  batchStatusLog: { create: jest.Mock }
  batchDisposal: { create: jest.Mock }
  product: { findUnique: jest.Mock }
  $transaction: jest.Mock
}

const txMock = {
  product: { findUnique: jest.fn() },
  batch: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  batchStatusLog: { create: jest.fn() },
  batchDisposal: { create: jest.fn() },
}

const mockedAssertBranchAccess = assertBranchAccess as jest.Mock

const batchFixture = {
  id: 'batch-1',
  productId: 'prod-1',
  batchNumber: 'B-001',
  manufacturingDate: new Date('2026-01-01'),
  expiryDate: new Date('2027-01-01'),
  purchasePrice: 10,
  mrp: 15,
  quantity: 50,
  reservedQuantity: 5,
  soldQuantity: 0,
  status: 'ACTIVE',
  blockedReason: null,
  supplierRef: 'S-1',
  purchaseId: null,
  branchId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  product: { id: 'prod-1', name: 'Paracetamol', sku: 'P-1' },
  statusLogs: [],
  disposals: [],
}

const user = { id: 'u-1', branchId: null }

describe('batch-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAssertBranchAccess.mockResolvedValue(undefined)
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.resolve([])
        : (arg as (tx: typeof txMock) => Promise<unknown>)(txMock)
    )
  })

  describe('expireDueBatches', () => {
    it('returns 0 when no batches are due for expiry', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      await expect(expireDueBatches()).resolves.toBe(0)
      expect(prismaMock.$transaction).not.toHaveBeenCalled()
    })

    it('flips due ACTIVE/BLOCKED batches to EXPIRED and writes status logs', async () => {
      prismaMock.batch.findMany.mockResolvedValue([
        { id: 'batch-1', status: 'ACTIVE' },
        { id: 'batch-2', status: 'BLOCKED' },
      ])
      await expect(expireDueBatches()).resolves.toBe(2)
      expect(prismaMock.batch.updateMany).toHaveBeenCalledWith({
        where: { id: 'batch-1', status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      })
      expect(prismaMock.batchStatusLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: 'batch-2',
          fromStatus: 'BLOCKED',
          toStatus: 'EXPIRED',
        }),
      })
      expect(prismaMock.$transaction).toHaveBeenCalled()
    })
  })

  describe('getBatches', () => {
    it('sweeps expired batches then returns paginated results', async () => {
      prismaMock.batch.findMany
        .mockResolvedValueOnce([]) // sweep query
        .mockResolvedValueOnce([batchFixture])
      prismaMock.batch.count.mockResolvedValue(1)

      const result = await getBatches({ page: 1, limit: 20 })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].availableQuantity).toBe(45)
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 })
    })

    it('builds an OR search across batch number and product fields', async () => {
      prismaMock.batch.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([batchFixture])
      prismaMock.batch.count.mockResolvedValue(1)

      await getBatches({ search: 'para' })
      const whereArg = prismaMock.batch.findMany.mock.calls[1][0].where
      expect(whereArg.OR).toEqual(
        expect.arrayContaining([
          { batchNumber: { contains: 'para', mode: 'insensitive' } },
          { product: { name: { contains: 'para', mode: 'insensitive' } } },
          { product: { sku: { contains: 'para', mode: 'insensitive' } } },
        ])
      )
    })

    it('applies status, product and branch filters, defaulting sort to expiryDate asc', async () => {
      prismaMock.batch.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([batchFixture])
      prismaMock.batch.count.mockResolvedValue(1)

      await getBatches({ status: 'EXPIRED', productId: 'prod-1', branchId: 'br-1' })
      const { where, orderBy } = prismaMock.batch.findMany.mock.calls[1][0]
      expect(where).toEqual(
        expect.objectContaining({ status: 'EXPIRED', productId: 'prod-1', branchId: 'br-1' })
      )
      expect(orderBy).toEqual({ expiryDate: 'asc' })
    })
  })

  describe('getBatchById', () => {
    it('returns the batch detail with available quantity', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      prismaMock.batch.findUnique.mockResolvedValue(batchFixture)

      const result = await getBatchById('batch-1')
      expect(result?.availableQuantity).toBe(45)
      expect(result?.batchNumber).toBe('B-001')
    })

    it('returns null when batch is not found', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      prismaMock.batch.findUnique.mockResolvedValue(null)
      await expect(getBatchById('missing')).resolves.toBeNull()
    })
  })

  describe('createBatch', () => {
    it('throws Not Found when the product does not exist', async () => {
      txMock.product.findUnique.mockResolvedValue(null)
      await expect(
        createBatch(
          { productId: 'prod-1', batchNumber: 'B-9', expiryDate: new Date('2027-01-01') },
          user
        )
      ).rejects.toThrow('Not Found: product')
    })

    it('throws when the product is inactive', async () => {
      txMock.product.findUnique.mockResolvedValue({ id: 'prod-1', isActive: false })
      await expect(
        createBatch(
          { productId: 'prod-1', batchNumber: 'B-9', expiryDate: new Date('2027-01-01') },
          user
        )
      ).rejects.toThrow('Product is inactive')
    })

    it('rejects duplicate batch numbers for the same product', async () => {
      txMock.product.findUnique.mockResolvedValue({ id: 'prod-1', isActive: true })
      txMock.batch.findFirst.mockResolvedValue({ id: 'batch-1' })
      await expect(
        createBatch(
          { productId: 'prod-1', batchNumber: 'B-001', expiryDate: new Date('2027-01-01') },
          user
        )
      ).rejects.toThrow('Conflict')
    })

    it('creates the batch and an initial status log', async () => {
      txMock.product.findUnique.mockResolvedValue({ id: 'prod-1', isActive: true })
      txMock.batch.findFirst.mockResolvedValue(null)
      txMock.batch.create.mockResolvedValue(batchFixture)

      await expect(
        createBatch(
          {
            productId: 'prod-1',
            batchNumber: 'B-001',
            expiryDate: new Date('2027-01-01'),
            purchasePrice: 10,
            mrp: 15,
            quantity: 50,
          },
          user
        )
      ).resolves.toMatchObject({ id: 'batch-1', availableQuantity: 45 })

      expect(txMock.batchStatusLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: 'batch-1',
          fromStatus: 'ACTIVE',
          toStatus: 'ACTIVE',
          changedById: 'u-1',
        }),
      })
    })
  })

  describe('updateBatch', () => {
    it('throws Not Found when the batch does not exist', async () => {
      txMock.batch.findUnique.mockResolvedValue(null)
      await expect(updateBatch('batch-1', { mrp: 20 }, user)).rejects.toThrow('Not Found: batch')
    })

    it('rejects edits on non-ACTIVE batches', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: 'DISPOSED',
        branchId: null,
      })
      await expect(updateBatch('batch-1', { mrp: 20 }, user)).rejects.toThrow(
        'Conflict: batch is disposed'
      )
    })

    it('updates non-lifecycle fields on an ACTIVE batch', async () => {
      txMock.batch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'ACTIVE', branchId: null })
      txMock.batch.updateMany.mockResolvedValue({ count: 1 })
      txMock.batch.findUniqueOrThrow.mockResolvedValue(batchFixture)

      await expect(
        updateBatch('batch-1', { mrp: 20, batchNumber: 'B-001-new' }, user)
      ).resolves.toMatchObject({ id: 'batch-1' })

      expect(txMock.batch.updateMany).toHaveBeenCalledWith({
        where: { id: 'batch-1', status: 'ACTIVE' },
        data: expect.objectContaining({ mrp: 20, batchNumber: 'B-001-new' }),
      })
    })
  })

  describe('blockBatch', () => {
    it('rejects blocking a non-ACTIVE batch', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: 'EXPIRED',
        branchId: null,
      })
      await expect(blockBatch('batch-1', 'Quality issue', user)).rejects.toThrow(
        'Conflict: batch is expired'
      )
    })

    it('blocks an ACTIVE batch and records the transition', async () => {
      txMock.batch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'ACTIVE', branchId: null })
      txMock.batch.updateMany.mockResolvedValue({ count: 1 })
      txMock.batch.findUniqueOrThrow.mockResolvedValue({ ...batchFixture, status: 'BLOCKED' })

      await expect(blockBatch('batch-1', 'Quality issue', user)).resolves.toMatchObject({
        status: 'BLOCKED',
      })

      expect(txMock.batch.updateMany).toHaveBeenCalledWith({
        where: { id: 'batch-1', status: 'ACTIVE' },
        data: { status: 'BLOCKED', blockedReason: 'Quality issue' },
      })
      expect(txMock.batchStatusLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: 'batch-1',
          fromStatus: 'ACTIVE',
          toStatus: 'BLOCKED',
          changedById: 'u-1',
        }),
      })
    })

    it('throws Not Found when the batch does not exist', async () => {
      txMock.batch.findUnique.mockResolvedValue(null)
      await expect(blockBatch('missing', 'reason', user)).rejects.toThrow('Not Found: batch')
    })
  })

  describe('disposeBatch', () => {
    it('records a partial disposal without changing status', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        branchId: null,
        quantity: 50,
        reservedQuantity: 5,
        soldQuantity: 0,
      })
      txMock.batch.findUniqueOrThrow.mockResolvedValue(batchFixture)

      await expect(
        disposeBatch('batch-1', { quantity: 10, reason: 'DAMAGED' }, user)
      ).resolves.toMatchObject({ id: 'batch-1' })

      expect(txMock.batchDisposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: 'batch-1',
          quantity: 10,
          reason: 'DAMAGED',
          disposedById: 'u-1',
        }),
      })
      expect(txMock.batch.updateMany).toHaveBeenCalledWith({
        where: { id: 'batch-1', status: 'ACTIVE', quantity: 50 },
        data: { quantity: 40 },
      })
      expect(txMock.batchStatusLog.create).not.toHaveBeenCalled()
    })

    it('disposes the full quantity and marks the batch DISPOSED with a status log', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        branchId: null,
        quantity: 10,
        reservedQuantity: 0,
        soldQuantity: 0,
      })
      txMock.batch.updateMany.mockResolvedValue({ count: 1 })
      txMock.batch.findUniqueOrThrow.mockResolvedValue({ ...batchFixture, status: 'DISPOSED' })

      await expect(
        disposeBatch('batch-1', { quantity: 10, reason: 'EXPIRED' }, user)
      ).resolves.toMatchObject({ status: 'DISPOSED' })

      expect(txMock.batch.updateMany).toHaveBeenCalledWith({
        where: { id: 'batch-1', status: 'ACTIVE', quantity: 10 },
        data: { status: 'DISPOSED', quantity: 0 },
      })
      expect(txMock.batchStatusLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: 'ACTIVE',
          toStatus: 'DISPOSED',
          changedById: 'u-1',
        }),
      })
    })

    it('rejects disposing more than the available quantity', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        branchId: null,
        quantity: 50,
        reservedQuantity: 5,
        soldQuantity: 0,
      })
      await expect(
        disposeBatch('batch-1', { quantity: 100, reason: 'DAMAGED' }, user)
      ).rejects.toThrow('Insufficient available quantity: available 45')
    })

    it('rejects disposal of a batch already disposed', async () => {
      txMock.batch.findUnique.mockResolvedValue({
        status: 'DISPOSED',
        branchId: null,
        quantity: 0,
        reservedQuantity: 0,
        soldQuantity: 0,
      })
      await expect(
        disposeBatch('batch-1', { quantity: 1, reason: 'DAMAGED' }, user)
      ).rejects.toThrow('Conflict: batch is disposed')
    })

    it('throws Not Found when the batch does not exist', async () => {
      txMock.batch.findUnique.mockResolvedValue(null)
      await expect(
        disposeBatch('missing', { quantity: 1, reason: 'DAMAGED' }, user)
      ).rejects.toThrow('Not Found: batch')
    })
  })
})
