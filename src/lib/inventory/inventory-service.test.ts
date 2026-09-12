import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import {
  approveAdjustment,
  createAdjustment,
  getAdjustments,
  getInventory,
  getMovements,
  rejectAdjustment,
} from '@/lib/inventory/inventory-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    inventory: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    product: { findMany: jest.fn(), findUnique: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    stockAdjustment: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    branch: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
  prisma: null,
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  inventory: {
    findMany: jest.Mock
    count: jest.Mock
    findUnique: jest.Mock
    updateMany: jest.Mock
    create: jest.Mock
  }
  product: { findMany: jest.Mock; findUnique: jest.Mock }
  inventoryMovement: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock }
  stockAdjustment: {
    findMany: jest.Mock
    count: jest.Mock
    create: jest.Mock
    findUnique: jest.Mock
    findUniqueOrThrow: jest.Mock
    updateMany: jest.Mock
  }
  branch: { findMany: jest.Mock; findUnique: jest.Mock }
  $transaction: jest.Mock
}

const txMock = {
  inventory: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  inventoryMovement: { create: jest.fn() },
  stockAdjustment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
}

const mockedAssertBranchAccess = assertBranchAccess as jest.Mock

const user = { id: 'user-1', branchId: 'br-1' }

const inventoryFixture = {
  id: 'inv-1',
  productId: 'prod-1',
  branchId: 'br-1',
  totalQuantity: 100,
  reservedQuantity: 10,
  availableQuantity: 90,
  updatedAt: new Date('2026-01-02'),
  product: {
    id: 'prod-1',
    name: 'Paracetamol 500mg',
    sku: 'PCM-500',
    unitOfMeasure: 'Strip',
    reorderLevel: 20,
    maxStockLevel: 200,
  },
  branch: { id: 'br-1', name: 'Branch A', code: 'BR-A' },
}

const adjustmentFixture = {
  id: 'adj-1',
  branchId: 'br-1',
  productId: 'prod-1',
  batchId: null,
  adjustmentType: 'PHYSICAL_COUNT',
  quantity: 5,
  reason: 'Cycle count',
  notes: null,
  status: 'PENDING',
  approvedById: null,
  approvedAt: null,
  createdById: 'user-1',
  createdAt: new Date('2026-01-05'),
} as const

const summaryFixture = {
  ...adjustmentFixture,
  status: 'APPROVED',
  createdBy: { id: 'user-1', name: 'User One' },
}

describe('inventory-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: (txn: unknown) => Promise<unknown>) =>
      fn(txMock)
    )
    mockedAssertBranchAccess.mockResolvedValue(undefined)
    txMock.stockAdjustment.create.mockResolvedValue(adjustmentFixture)
    txMock.inventory.findUnique.mockResolvedValue(null)
    txMock.inventory.updateMany.mockResolvedValue({ count: 1 })
    txMock.inventory.create.mockResolvedValue({ id: 'inv-2' })
    txMock.inventoryMovement.create.mockResolvedValue({ id: 'mov-1' })
    txMock.stockAdjustment.updateMany.mockResolvedValue({ count: 1 })
    txMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue(summaryFixture)
  })

  describe('getInventory', () => {
    it('returns paginated rows with computed stock status', async () => {
      prismaMock.inventory.findMany.mockResolvedValue([inventoryFixture])
      prismaMock.inventory.count.mockResolvedValue(1)
      const result = await getInventory({ page: 1, limit: 20 })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].stockStatus).toBe('in_stock')
      expect(result.pagination.total).toBe(1)
    })

    it('marks low stock when available <= reorder level', async () => {
      prismaMock.inventory.findMany.mockResolvedValue([
        { ...inventoryFixture, availableQuantity: 15 },
      ])
      prismaMock.inventory.count.mockResolvedValue(1)
      const result = await getInventory({})
      expect(result.data[0].stockStatus).toBe('low_stock')
    })

    it('builds a product OR filter for search', async () => {
      prismaMock.inventory.findMany.mockResolvedValue([])
      prismaMock.inventory.count.mockResolvedValue(0)
      await getInventory({ search: 'para', branchId: 'br-1' })
      const whereArg = prismaMock.inventory.findMany.mock.calls[0][0].where
      expect(whereArg.branchId).toBe('br-1')
      expect(whereArg.product.OR).toHaveLength(3)
    })

    it('filters by status in memory then paginates', async () => {
      prismaMock.inventory.findMany.mockResolvedValue([
        inventoryFixture,
        { ...inventoryFixture, id: 'inv-2', availableQuantity: 10 },
        { ...inventoryFixture, id: 'inv-3', availableQuantity: 250 },
      ])
      const result = await getInventory({ status: 'low_stock', page: 1, limit: 20 })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('inv-2')
      expect(result.pagination.total).toBe(1)
    })
  })

  describe('getMovements', () => {
    const movementFixture = {
      id: 'mov-1',
      inventoryId: 'inv-1',
      type: 'ADJUSTMENT',
      quantity: 5,
      quantityBefore: 90,
      quantityAfter: 95,
      referenceType: 'ADJUSTMENT',
      referenceId: 'adj-1',
      batchId: null,
      notes: null,
      createdAt: new Date('2026-01-05'),
      inventory: {
        productId: 'prod-1',
        product: {
          id: 'prod-1',
          name: 'Paracetamol 500mg',
          sku: 'PCM-500',
          unitOfMeasure: 'Strip',
        },
        branch: { id: 'br-1', name: 'Branch A', code: 'BR-A' },
      },
      createdBy: { id: 'user-1', name: 'User One' },
    }

    it('returns paginated movements', async () => {
      prismaMock.inventoryMovement.findMany.mockResolvedValue([movementFixture])
      prismaMock.inventoryMovement.count.mockResolvedValue(1)
      const result = await getMovements({ page: 1, limit: 20, branchId: 'br-1' })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].type).toBe('ADJUSTMENT')
    })

    it('filters by type and product under inventory', async () => {
      prismaMock.inventoryMovement.findMany.mockResolvedValue([])
      prismaMock.inventoryMovement.count.mockResolvedValue(0)
      await getMovements({ type: 'IN', productId: 'prod-1', search: 'para' })
      const whereArg = prismaMock.inventoryMovement.findMany.mock.calls[0][0].where
      expect(whereArg.type).toBe('IN')
      expect(whereArg.inventory.productId).toBe('prod-1')
      expect(whereArg.inventory.product.OR).toHaveLength(2)
    })
  })

  describe('getAdjustments', () => {
    it('returns adjusted rows enriched with product and branch', async () => {
      prismaMock.stockAdjustment.findMany.mockResolvedValue([adjustmentFixture])
      prismaMock.stockAdjustment.count.mockResolvedValue(1)
      prismaMock.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Paracetamol 500mg', sku: 'PCM-500' },
      ])
      prismaMock.branch.findMany.mockResolvedValue([{ id: 'br-1', name: 'Branch A', code: 'BR-A' }])
      const result = await getAdjustments({ page: 1, limit: 20 })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].product.name).toBe('Paracetamol 500mg')
      expect(result.data[0].branch.name).toBe('Branch A')
    })

    it('resolves search to matching product ids first', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-9' }])
      prismaMock.stockAdjustment.findMany.mockResolvedValue([])
      prismaMock.stockAdjustment.count.mockResolvedValue(0)
      await getAdjustments({ search: 'para' })
      expect(prismaMock.product.findMany).toHaveBeenCalled()
      const whereArg = prismaMock.stockAdjustment.findMany.mock.calls[0][0].where
      expect(whereArg.productId).toEqual({ in: ['prod-9'] })
    })
  })

  describe('createAdjustment', () => {
    const input = {
      branchId: 'br-1',
      productId: 'prod-1',
      adjustmentType: 'PHYSICAL_COUNT' as const,
      reason: 'Cycle count',
    }

    beforeEach(() => {
      prismaMock.product.findUnique.mockResolvedValue({ id: 'prod-1', isActive: true })
    })

    it('auto-approves small adjustments and applies stock in one transaction', async () => {
      const result = await createAdjustment({ ...input, quantity: 5 }, user)

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
      expect(mockedAssertBranchAccess).not.toHaveBeenCalled()
      expect(txMock.stockAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: 5, status: 'PENDING', createdById: 'user-1' }),
        })
      )
      // Creates an inventory row when none exists
      expect(txMock.inventory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          branchId: 'br-1',
          totalQuantity: 5,
          availableQuantity: 5,
          reservedQuantity: 0,
        },
      })
      // Records the movement
      expect(txMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: 5,
          quantityBefore: 0,
          quantityAfter: 5,
          referenceType: 'ADJUSTMENT',
          referenceId: 'adj-1',
          createdById: 'user-1',
        }),
      })
      // Marks the adjustment approved
      expect(txMock.stockAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 'adj-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'user-1' }),
      })
      expect(result.status).toBe('APPROVED')
    })

    it('preserves total and available for existing inventory', async () => {
      prismaMock.inventory.findUnique.mockResolvedValue({ availableQuantity: 25 })
      txMock.inventory.findUnique.mockResolvedValue({
        id: 'inv-1',
        totalQuantity: 30,
        availableQuantity: 25,
        updatedAt: new Date('2026-01-02'),
      })
      txMock.stockAdjustment.create.mockResolvedValue({ ...adjustmentFixture, quantity: -3 })
      await createAdjustment({ ...input, quantity: -3 }, user)
      expect(txMock.inventory.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', updatedAt: new Date('2026-01-02') },
        data: { totalQuantity: 27, availableQuantity: 22 },
      })
    })

    it('leaves large adjustments pending for approval', async () => {
      prismaMock.stockAdjustment.create.mockResolvedValue(adjustmentFixture)
      const result = await createAdjustment({ ...input, quantity: 50 }, user)
      expect(prismaMock.inventory.findUnique).not.toHaveBeenCalled()
      expect(txMock.inventory.findUnique).not.toHaveBeenCalled()
      expect(txMock.stockAdjustment.updateMany).not.toHaveBeenCalled()
      expect(result.status).toBe('PENDING')
    })

    it('rejects reductions beyond available stock', async () => {
      prismaMock.inventory.findUnique.mockResolvedValue({ availableQuantity: 10 })
      await expect(createAdjustment({ ...input, quantity: -50 }, user)).rejects.toThrow(
        'Insufficient available stock: available 10'
      )
    })

    it('maps a lost concurrency race to a conflict', async () => {
      txMock.inventory.findUnique.mockResolvedValue({
        id: 'inv-1',
        totalQuantity: 30,
        availableQuantity: 25,
        updatedAt: new Date('2026-01-02'),
      })
      txMock.inventory.updateMany.mockResolvedValue({ count: 0 })
      await expect(createAdjustment({ ...input, quantity: 5 }, user)).rejects.toThrow(
        'Conflict: inventory changed concurrently, please retry'
      )
    })

    it('rejects when the product is missing or inactive', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null)
      await expect(createAdjustment({ ...input, quantity: 5 }, user)).rejects.toThrow(
        'Not Found: product'
      )
      prismaMock.product.findUnique.mockResolvedValue({ id: 'prod-1', isActive: false })
      await expect(createAdjustment({ ...input, quantity: 5 }, user)).rejects.toThrow(
        'Product is inactive'
      )
    })
  })

  describe('approveAdjustment', () => {
    beforeEach(() => {
      txMock.stockAdjustment.findUnique.mockResolvedValue(adjustmentFixture)
    })

    it('approves a pending adjustment and applies stock', async () => {
      const result = await approveAdjustment('adj-1', user)
      expect(mockedAssertBranchAccess).toHaveBeenCalledWith(user, 'br-1')
      expect(txMock.inventory.create).toHaveBeenCalled()
      expect(txMock.stockAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 'adj-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'user-1' }),
      })
      expect(result.status).toBe('APPROVED')
    })

    it('rejects double approval', async () => {
      txMock.stockAdjustment.findUnique.mockResolvedValue({
        ...adjustmentFixture,
        status: 'APPROVED',
      })
      await expect(approveAdjustment('adj-1', user)).rejects.toThrow(
        'Conflict: adjustment is approved, not pending'
      )
    })

    it('throws not found for missing adjustments', async () => {
      txMock.stockAdjustment.findUnique.mockResolvedValue(null)
      await expect(approveAdjustment('nope', user)).rejects.toThrow('Not Found: adjustment')
    })
  })

  describe('rejectAdjustment', () => {
    beforeEach(() => {
      txMock.stockAdjustment.findUnique.mockResolvedValue(adjustmentFixture)
    })

    it('rejects a pending adjustment without touching stock', async () => {
      txMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
        ...adjustmentFixture,
        status: 'REJECTED',
        createdBy: { id: 'user-1', name: 'User One' },
      })
      const result = await rejectAdjustment('adj-1', user)
      expect(mockedAssertBranchAccess).toHaveBeenCalledWith(user, 'br-1')
      expect(txMock.stockAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 'adj-1', status: 'PENDING' },
        data: { status: 'REJECTED' },
      })
      expect(txMock.inventoryMovement.create).not.toHaveBeenCalled()
      expect(result.status).toBe('REJECTED')
    })

    it('cannot reject an already-processed adjustment', async () => {
      txMock.stockAdjustment.findUnique.mockResolvedValue({
        ...adjustmentFixture,
        status: 'REJECTED',
      })
      await expect(rejectAdjustment('adj-1', user)).rejects.toThrow(
        'Conflict: adjustment is rejected, not pending'
      )
    })
  })
})
