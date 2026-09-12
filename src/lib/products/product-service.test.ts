import prisma from '@/lib/db/prisma'
import {
  checkBarcodeExists,
  checkSkuExists,
  createProduct,
  deleteCategory,
  getCategories,
  getCategoryTree,
  getHsnCodes,
  getProductById,
  getProducts,
  updateProduct,
} from '@/lib/products/product-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    productBarcode: { findUnique: jest.fn() },
    productCategory: { groupBy: jest.fn() },
    hsnCode: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
  prisma: null,
}))

const prismaMock = prisma as unknown as {
  category: {
    findMany: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  product: {
    findMany: jest.Mock
    findUnique: jest.Mock
    findUniqueOrThrow: jest.Mock
    create: jest.Mock
    update: jest.Mock
    count: jest.Mock
  }
  productBarcode: { findUnique: jest.Mock }
  productCategory: { groupBy: jest.Mock }
  hsnCode: { findMany: jest.Mock; findUnique: jest.Mock }
  $transaction: jest.Mock
}

const txMock = {
  product: { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
  productCategory: { createMany: jest.fn(), deleteMany: jest.fn() },
  productBarcode: { createMany: jest.fn(), deleteMany: jest.fn() },
}

describe('product-service', () => {
  const categoryFixture = {
    id: 'cat-1',
    name: 'Tablets',
    slug: 'tablets',
    description: null,
    parentId: null,
    imageUrl: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: (txn: typeof txMock) => Promise<unknown>) =>
      fn(txMock)
    )
  })

  describe('getCategories', () => {
    it('queries with optional filters', async () => {
      prismaMock.category.findMany.mockResolvedValue([categoryFixture])
      const result = await getCategories({ isActive: true })
      expect(prismaMock.category.findMany).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Tablets')
    })
  })

  describe('getCategoryTree', () => {
    it('builds a hierarchical tree with product counts', async () => {
      const parent = { ...categoryFixture, id: 'parent-1', parentId: null }
      const child = { ...categoryFixture, id: 'child-1', parentId: 'parent-1' }
      prismaMock.category.findMany.mockResolvedValue([parent, child])
      prismaMock.productCategory.groupBy.mockResolvedValue([
        { categoryId: 'child-1', _count: { _all: 3 } },
      ])

      const tree = await getCategoryTree()
      expect(tree).toHaveLength(1)
      expect(tree[0].id).toBe('parent-1')
      expect(tree[0].children[0].id).toBe('child-1')
      expect(tree[0].children[0].productCount).toBe(3)
    })
  })

  describe('deleteCategory', () => {
    it('soft deletes by deactivating', async () => {
      prismaMock.category.update.mockResolvedValue({ ...categoryFixture, isActive: false })
      await deleteCategory('cat-1')
      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { isActive: false },
      })
    })
  })

  describe('getProducts', () => {
    const productFixture = {
      id: 'prod-1',
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      sku: 'PCM-500',
      barcode: '1234567890123',
      description: null,
      manufacturer: 'Generic Pharma',
      composition: null,
      drugSchedule: 'NONE',
      isPrescriptionRequired: false,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      packSize: null,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      isGstExempt: false,
      mrp: 25,
      ptr: 20,
      costPrice: 15,
      minStockLevel: 10,
      maxStockLevel: null,
      reorderLevel: 20,
      imageUrl: null,
      isActive: true,
      isReturnable: true,
      createdById: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      categories: [],
      barcodes: [],
      hsnCodeRef: null,
    }

    it('returns paginated products with relations', async () => {
      prismaMock.product.findMany.mockResolvedValue([productFixture])
      prismaMock.product.count.mockResolvedValue(1)
      const result = await getProducts({ page: 1, limit: 20, search: 'paracetamol' })
      expect(result.data).toHaveLength(1)
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 })
    })

    it('filters by categoryId', async () => {
      prismaMock.product.findMany.mockResolvedValue([])
      prismaMock.product.count.mockResolvedValue(0)
      await getProducts({ categoryId: 'cat-1' })
      const whereArg = prismaMock.product.findMany.mock.calls[0][0].where
      expect(whereArg.categories.some.categoryId).toBe('cat-1')
    })
  })

  describe('createProduct', () => {
    const input = {
      name: 'Paracetamol 500mg',
      sku: 'PCM-500',
      mrp: 25,
      createdById: 'user-1',
      categoryIds: ['cat-1'],
      barcodes: [{ barcode: '99999999', type: 'EAN13', isPrimary: false }],
    }

    beforeEach(() => {
      txMock.product.create.mockResolvedValue({ id: 'prod-1' })
      txMock.product.findUniqueOrThrow.mockResolvedValue({ id: 'prod-1', name: input.name })
      txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
      txMock.productBarcode.createMany.mockResolvedValue({ count: 1 })
    })

    it('creates the product and links categories and barcodes in one transaction', async () => {
      await createProduct(input)
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
      expect(txMock.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: input.name, sku: input.sku }),
      })
      expect(txMock.productCategory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ categoryId: 'cat-1' })]),
        skipDuplicates: true,
      })
      expect(txMock.productBarcode.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ barcode: '99999999' })]),
        skipDuplicates: true,
      })
    })

    it('does not link categories when none supplied', async () => {
      await createProduct({ ...input, categoryIds: undefined })
      expect(txMock.productCategory.createMany).not.toHaveBeenCalled()
    })
  })

  describe('updateProduct', () => {
    const input = { name: 'New Name', categoryIds: ['cat-2'] }

    beforeEach(() => {
      txMock.product.update.mockResolvedValue({ id: 'prod-1' })
      txMock.product.findUniqueOrThrow.mockResolvedValue({ id: 'prod-1', name: input.name })
      txMock.productCategory.deleteMany.mockResolvedValue({ count: 1 })
      txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
    })

    it('replaces category associations when categoryIds provided', async () => {
      await updateProduct('prod-1', input)
      expect(txMock.productCategory.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
      })
      expect(txMock.productCategory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ categoryId: 'cat-2' })]),
        skipDuplicates: true,
      })
    })
  })

  describe('uniqueness checks', () => {
    it('checkSkuExists returns true for an existing sku', async () => {
      prismaMock.product.findUnique.mockResolvedValue({ id: 'prod-1', sku: 'PCM-500' })
      expect(await checkSkuExists('PCM-500')).toBe(true)
      expect(await checkSkuExists('PCM-500', 'prod-1')).toBe(false)
    })

    it('checkBarcodeExists checks primary and additional barcodes', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null)
      prismaMock.productBarcode.findUnique.mockResolvedValue({ productId: 'prod-2', barcode: 'X' })
      expect(await checkBarcodeExists('X')).toBe(true)
      expect(await checkBarcodeExists('X', 'prod-2')).toBe(false)
    })
  })

  describe('getHsnCodes', () => {
    it('returns active HSN codes ordered by code', async () => {
      prismaMock.hsnCode.findMany.mockResolvedValue([{ code: '3004' }])
      const codes = await getHsnCodes()
      expect(codes).toHaveLength(1)
      expect(prismaMock.hsnCode.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      })
    })
  })

  describe('getProductById', () => {
    it('returns null when not found', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null)
      expect(await getProductById('nope')).toBeNull()
    })
  })
})
