/** @jest-environment node */
import { Prisma } from '@prisma/client'

import { MAX_CSV_FILE_SIZE, MAX_CSV_ROWS } from '@/lib/constants/product-import'
import prisma from '@/lib/db/prisma'
import { importProductsFromCsv, type ProductImportFile } from '@/lib/products/product-import'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    category: { findMany: jest.fn() },
    hsnCode: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    productBarcode: { findMany: jest.fn() },
    productCategory: { createMany: jest.fn() },
    productBarcodeCreate: jest.fn(),
    $transaction: jest.fn(),
  },
  prisma: null,
}))

const prismaMock = prisma as unknown as {
  category: { findMany: jest.Mock }
  hsnCode: { findMany: jest.Mock }
  product: { findMany: jest.Mock }
  productBarcode: { findMany: jest.Mock }
  productCategory: { createMany: jest.Mock }
  $transaction: jest.Mock
}

const txMock = {
  product: { create: jest.fn() },
  productCategory: { createMany: jest.fn() },
  productBarcode: { createMany: jest.fn() },
}

const categories = [
  { id: 'cat-1', name: 'Analgesics', slug: 'analgesics', parentId: null },
  { id: 'cat-2', name: 'Antibiotics', slug: 'antibiotics', parentId: null },
]

const hsnCodes = [
  {
    id: 'hsn-1',
    code: '3004',
    description: 'Medicaments',
    gstRate: 12,
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 12,
    cessRate: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
  },
]

function makeFile(content: string, over?: Partial<ProductImportFile>): ProductImportFile {
  return {
    name: 'products.csv',
    size: Buffer.byteLength(content),
    type: 'text/csv',
    content: Buffer.from(content),
    ...over,
  }
}

function buildCsv(rows: Array<Record<string, string>>): string {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => r[h] ?? '').join(','))]
  return lines.join('\n')
}

const validRow = (over: Record<string, string> = {}): Record<string, string> => ({
  name: 'Paracetamol 500mg',
  sku: 'PCM-500',
  mrp: '25.00',
  categories: 'analgesics',
  ...over,
})

describe('product-import service — file validation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a non-CSV extension', async () => {
    const res = await importProductsFromCsv(makeFile('a,b', { name: 'products.xlsx' }), 'u1')
    expect(res.failed).toBe(1)
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toContain('.csv')
  })

  it('rejects an unsupported MIME type', async () => {
    const res = await importProductsFromCsv(makeFile('a,b', { type: 'image/png' }), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('Unsupported file type')
  })

  it('rejects an empty file', async () => {
    const res = await importProductsFromCsv(makeFile('', { size: 0 }), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('empty')
  })

  it('rejects a file over the size limit', async () => {
    const res = await importProductsFromCsv(makeFile('a,b', { size: MAX_CSV_FILE_SIZE + 1 }), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('maximum size')
  })
})

describe('product-import service — header / parse validation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a missing required column', async () => {
    const csv = 'name,mrp,categories\nParacetamol,25,analgesics\n'
    const res = await importProductsFromCsv(makeFile(csv), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('Missing required column(s): sku')
  })

  it('rejects unknown columns', async () => {
    const csv = 'name,sku,mrp,categories,bananas\nA,PCM-1,10,analgesics,5\n'
    const res = await importProductsFromCsv(makeFile(csv), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('Unknown column(s): bananas')
  })

  it('rejects malformed CSV', async () => {
    const csv = 'name,sku,mrp,categories\nA,B,1,C,EXTRA\n'
    const res = await importProductsFromCsv(makeFile(csv), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('Malformed CSV')
  })

  it('rejects a whitespace-only file', async () => {
    const res = await importProductsFromCsv(makeFile('   \n  '), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('empty')
  })

  it('rejects a file with headers but no data rows', async () => {
    const csv = 'name,sku,mrp,categories\n'
    const res = await importProductsFromCsv(makeFile(csv), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('no data rows')
  })

  it('rejects a file with more rows than the maximum', async () => {
    const rows = Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => ({
      name: `Product ${i}`,
      sku: `SKU-${i}`,
      mrp: '10',
      categories: 'analgesics',
    }))
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain(`maximum of ${MAX_CSV_ROWS} rows`)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('accepts case-insensitive headers', async () => {
    prismaMock.category.findMany.mockResolvedValue(categories)
    prismaMock.hsnCode.findMany.mockResolvedValue(hsnCodes)
    prismaMock.product.findMany.mockResolvedValue([])
    prismaMock.productBarcode.findMany.mockResolvedValue([])
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => unknown) => fn(txMock))
    txMock.product.create.mockImplementation(async (args: { data: { sku: string } }) => ({
      id: `prod-${args.data.sku}`,
      ...args.data,
    }))
    txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
    txMock.productBarcode.createMany.mockResolvedValue({ count: 0 })

    const csv = 'Name,SKU,MRP,Categories\nParacetamol,PCM-1,25,analgesics\n'
    const res = await importProductsFromCsv(makeFile(csv), 'u1')
    expect(res.failed).toBe(0)
    expect(res.imported).toBe(1)
  })
})

describe('product-import service — row validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.category.findMany.mockResolvedValue(categories)
    prismaMock.hsnCode.findMany.mockResolvedValue(hsnCodes)
    prismaMock.product.findMany.mockResolvedValue([])
    prismaMock.productBarcode.findMany.mockResolvedValue([])
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => unknown) => fn(txMock))
    txMock.product.create.mockImplementation(async (args: { data: { sku: string } }) => ({
      id: `prod-${args.data.sku}`,
      ...args.data,
    }))
    txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
    txMock.productBarcode.createMany.mockResolvedValue({ count: 0 })
  })

  it('imports a single valid row applying defaults and resolving the category', async () => {
    const res = await importProductsFromCsv(makeFile(buildCsv([validRow()])), 'u1')
    expect(res.failed).toBe(0)
    expect(res.imported).toBe(1)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(txMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Paracetamol 500mg',
          sku: 'PCM-500',
          mrp: 25,
          gstRate: 12,
          cgstRate: 6,
          drugSchedule: 'NONE',
          unitOfMeasure: 'Strip',
          minStockLevel: 10,
          reorderLevel: 20,
          createdById: 'u1',
        }),
      })
    )
    expect(txMock.productCategory.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([{ productId: 'prod-PCM-500', categoryId: 'cat-1' }]),
      })
    )
  })

  it('imports multiple products in one transaction, aggregating relations', async () => {
    const rows = [
      validRow({ sku: 'PCM-1' }),
      validRow({ sku: 'PCM-2', categories: 'antibiotics;Analgesics' }),
    ]
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.failed).toBe(0)
    expect(res.imported).toBe(2)
    expect(txMock.product.create).toHaveBeenCalledTimes(2)
    const catData = txMock.productCategory.createMany.mock.calls[0][0].data
    expect(catData).toEqual(
      expect.arrayContaining([
        { productId: 'prod-PCM-1', categoryId: 'cat-1' },
        { productId: 'prod-PCM-2', categoryId: 'cat-2' },
        { productId: 'prod-PCM-2', categoryId: 'cat-1' },
      ])
    )
  })

  it('parses quoted commas and a UTF-8 BOM', async () => {
    const content = '\uFEFFname,sku,mrp,categories\n"Paracetamol, Extra",PCM-9,10,analgesics\n'
    const res = await importProductsFromCsv(makeFile(content), 'u1')
    expect(res.imported).toBe(1)
    expect(txMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Paracetamol, Extra' }) })
    )
  })

  it('imports additional barcodes as ProductBarcode rows', async () => {
    const row = validRow({ barcode: '890111', additionalBarcodes: '890222;890333' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.imported).toBe(1)
    expect(txMock.productBarcode.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          { productId: 'prod-PCM-500', barcode: '890222', type: 'EAN13', isPrimary: false },
          { productId: 'prod-PCM-500', barcode: '890333', type: 'EAN13', isPrimary: false },
        ]),
      })
    )
  })

  it('resolves categories by name case-insensitively', async () => {
    const row = validRow({ categories: 'antibiotics' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.imported).toBe(1)
    const catData = txMock.productCategory.createMany.mock.calls[0][0].data
    expect(catData).toEqual([{ productId: 'prod-PCM-500', categoryId: 'cat-2' }])
  })

  it('rejects an unknown category', async () => {
    const row = validRow({ categories: 'not-a-category' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.imported).toBe(0)
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('not found')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a row with only separators in categories', async () => {
    const row = validRow({ categories: ';;;' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.imported).toBe(0)
    expect(res.failed).toBe(1)
  })

  it('rejects an unknown HSN code', async () => {
    const row = validRow({ hsnCode: '9999' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].field).toBe('hsnCode')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('accepts a known active HSN code', async () => {
    const row = validRow({ hsnCode: '3004' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.imported).toBe(1)
    expect(txMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hsnCode: '3004' }) })
    )
  })

  it('rejects missing MRP', async () => {
    const row = validRow({ mrp: '' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].field).toBe('mrp')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric MRP instead of coercing it', async () => {
    const row = validRow({ mrp: 'abc' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].field).toBe('mrp')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an invalid additional barcode', async () => {
    const row = validRow({ additionalBarcodes: '###' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].field).toBe('additionalBarcodes')
  })

  it('reports row numbers starting after the header (row 2)', async () => {
    const rows = [validRow(), validRow({ sku: 'PCM-2', mrp: '' })]
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].row).toBe(3)
  })
})

describe('product-import service — duplicate / conflict handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.category.findMany.mockResolvedValue(categories)
    prismaMock.hsnCode.findMany.mockResolvedValue(hsnCodes)
    prismaMock.product.findMany.mockResolvedValue([])
    prismaMock.productBarcode.findMany.mockResolvedValue([])
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => unknown) => fn(txMock))
    txMock.product.create.mockImplementation(async (args: { data: { sku: string } }) => ({
      id: `prod-${args.data.sku}`,
      ...args.data,
    }))
    txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
    txMock.productBarcode.createMany.mockResolvedValue({ count: 0 })
  })

  it('rejects a duplicated SKU within the same file', async () => {
    const rows = [validRow(), validRow({ name: 'Another' })]
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('appears more than once')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a duplicated barcode within the same file', async () => {
    const rows = [validRow({ barcode: '890999' }), validRow({ sku: 'PCM-2', barcode: '890999' })]
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('appears more than once')
  })

  it('rejects a primary barcode that duplicates an additional one in the same row', async () => {
    const row = validRow({ barcode: '890111', additionalBarcodes: '890111' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('cannot be both primary and additional')
  })

  it('rejects an SKU that already exists in the database', async () => {
    prismaMock.product.findMany.mockImplementation(
      (args: { where?: { sku?: { in: string[] } } }) => {
        if (args.where?.sku) return Promise.resolve([{ sku: 'PCM-500' }])
        return Promise.resolve([])
      }
    )
    const res = await importProductsFromCsv(makeFile(buildCsv([validRow()])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('already exists in the database')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a primary barcode that already exists', async () => {
    prismaMock.product.findMany.mockImplementation(
      (args: { where?: { barcode?: { in: string[] } } }) => {
        if (args.where?.barcode) return Promise.resolve([{ barcode: '890123' }])
        return Promise.resolve([])
      }
    )
    const row = validRow({ barcode: '890123' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('already exists in the database')
  })

  it('rejects an additional barcode that already exists', async () => {
    prismaMock.productBarcode.findMany.mockImplementation(
      (args: { where?: { barcode?: { in: string[] } } }) => {
        if (args.where?.barcode) return Promise.resolve([{ barcode: '890777' }])
        return Promise.resolve([])
      }
    )
    const row = validRow({ additionalBarcodes: '890777' })
    const res = await importProductsFromCsv(makeFile(buildCsv([row])), 'u1')
    expect(res.failed).toBe(1)
    expect(res.errors[0].message).toContain('already exists in the database')
  })

  it('is all-or-nothing: one bad row aborts the whole file', async () => {
    const rows = [validRow({ sku: 'PCM-1' }), validRow({ sku: 'PCM-2', mrp: 'abc' })]
    const res = await importProductsFromCsv(makeFile(buildCsv(rows)), 'u1')
    expect(res.imported).toBe(0)
    expect(res.failed).toBe(1)
    expect(txMock.product.create).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('product-import service — transaction behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.category.findMany.mockResolvedValue(categories)
    prismaMock.hsnCode.findMany.mockResolvedValue(hsnCodes)
    prismaMock.product.findMany.mockResolvedValue([])
    prismaMock.productBarcode.findMany.mockResolvedValue([])
    txMock.product.create.mockImplementation(async (args: { data: { sku: string } }) => ({
      id: `prod-${args.data.sku}`,
      ...args.data,
    }))
    txMock.productCategory.createMany.mockResolvedValue({ count: 1 })
    txMock.productBarcode.createMany.mockResolvedValue({ count: 0 })
  })

  it('maps a unique-constraint race to a Conflict error and aborts', async () => {
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`sku`)', {
        code: 'P2002',
        clientVersion: '5.17.0',
      })
    )
    await expect(importProductsFromCsv(makeFile(buildCsv([validRow()])), 'u1')).rejects.toThrow(
      /Conflict/
    )
  })

  it('rethrows non-conflict transaction errors', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('database down'))
    await expect(importProductsFromCsv(makeFile(buildCsv([validRow()])), 'u1')).rejects.toThrow(
      'database down'
    )
  })

  it('returns a full summary on success', async () => {
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => unknown) => fn(txMock))
    const res = await importProductsFromCsv(makeFile(buildCsv([validRow()])), 'u1')
    expect(res).toEqual(
      expect.objectContaining({
        fileName: 'products.csv',
        totalRows: 1,
        imported: 1,
        failed: 0,
        errors: [],
      })
    )
  })
})
