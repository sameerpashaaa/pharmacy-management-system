import {
  barcodeSchema,
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  productListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from '@/lib/validations/product'

describe('product & category validation schemas', () => {
  describe('createCategorySchema', () => {
    it('accepts valid category data', () => {
      const data = { name: 'Antibiotics', slug: 'antibiotics', sortOrder: 1, isActive: true }
      const result = createCategorySchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('rejects a name shorter than 2 characters', () => {
      const result = createCategorySchema.safeParse({ name: 'A', slug: 'a' })
      expect(result.success).toBe(false)
    })

    it('rejects an invalid slug format', () => {
      const result = createCategorySchema.safeParse({ name: 'Antibiotics', slug: 'Antibiotics!!' })
      expect(result.success).toBe(false)
    })

    it('rejects duplicate-style invalid slug with spaces', () => {
      const result = createCategorySchema.safeParse({ name: 'A B', slug: 'a b' })
      expect(result.success).toBe(false)
    })

    it('accepts an optional parentId', () => {
      const result = createCategorySchema.safeParse({
        name: 'Sub Category',
        slug: 'sub-category',
        parentId: 'parent-123',
      })
      expect(result.success).toBe(true)
      expect(result.success && result.data.parentId).toBe('parent-123')
    })
  })

  describe('updateCategorySchema', () => {
    it('accepts partial updates', () => {
      const result = updateCategorySchema.safeParse({ name: 'Renamed' })
      expect(result.success).toBe(true)
    })

    it('rejects an invalid parentId type', () => {
      const result = updateCategorySchema.safeParse({ parentId: 123 })
      expect(result.success).toBe(false)
    })
  })

  describe('createProductSchema', () => {
    const validProduct = {
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      sku: 'PCM-500',
      barcode: '8901234567890',
      drugSchedule: 'NONE',
      isPrescriptionRequired: false,
      unitOfMeasure: 'Strip',
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 25,
      minStockLevel: 10,
      reorderLevel: 20,
      categoryIds: ['cat-1'],
    }

    it('accepts valid product data', () => {
      const result = createProductSchema.safeParse(validProduct)
      expect(result.success).toBe(true)
    })

    it('applies defaults for schedules and GST rates', () => {
      const result = createProductSchema.safeParse({
        ...validProduct,
        drugSchedule: undefined,
        gstRate: undefined,
        cgstRate: undefined,
        sgstRate: undefined,
        igstRate: undefined,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.drugSchedule).toBe('NONE')
        expect(result.data.gstRate).toBe(12)
        expect(result.data.cgstRate).toBe(6)
      }
    })

    it('rejects a missing product name', () => {
      const result = createProductSchema.safeParse({ ...validProduct, name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects a lowercase SKU', () => {
      const result = createProductSchema.safeParse({ ...validProduct, sku: 'pcm-500' })
      expect(result.success).toBe(false)
    })

    it('rejects SKU with invalid characters', () => {
      const result = createProductSchema.safeParse({ ...validProduct, sku: 'PCM 500!' })
      expect(result.success).toBe(false)
    })

    it('rejects a missing mrp', () => {
      const result = createProductSchema.safeParse({ ...validProduct, mrp: undefined })
      expect(result.success).toBe(false)
    })

    it('rejects negative GST rate', () => {
      const result = createProductSchema.safeParse({ ...validProduct, gstRate: -1 })
      expect(result.success).toBe(false)
    })

    it('requires at least one category', () => {
      const result = createProductSchema.safeParse({ ...validProduct, categoryIds: [] })
      expect(result.success).toBe(false)
    })

    it('rejects invalid drug schedule values', () => {
      const result = createProductSchema.safeParse({ ...validProduct, drugSchedule: 'Z' })
      expect(result.success).toBe(false)
    })

    it('accepts additional barcodes', () => {
      const result = createProductSchema.safeParse({
        ...validProduct,
        barcodes: [{ barcode: '8901234567899', type: 'EAN13', isPrimary: false }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects an empty additional barcode', () => {
      const result = createProductSchema.safeParse({
        ...validProduct,
        barcodes: [{ barcode: '', type: 'EAN13', isPrimary: false }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateProductSchema', () => {
    it('accepts partial updates', () => {
      const result = updateProductSchema.safeParse({ name: 'Renamed Product' })
      expect(result.success).toBe(true)
    })

    it('accepts categoryIds and barcodes without base fields', () => {
      const result = updateProductSchema.safeParse({
        categoryIds: ['cat-1'],
        barcodes: [{ barcode: '123', type: 'EAN13', isPrimary: true }],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('barcodeSchema', () => {
    it('accepts alphanumeric input', () => {
      const result = barcodeSchema.safeParse({ barcode: 'ABC-123' })
      expect(result.success).toBe(true)
    })

    it('rejects special characters', () => {
      const result = barcodeSchema.safeParse({ barcode: 'ABC#123' })
      expect(result.success).toBe(false)
    })

    it('defaults type to EAN13 and isPrimary to false', () => {
      const result = barcodeSchema.safeParse({ barcode: '1234567890123' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('EAN13')
        expect(result.data.isPrimary).toBe(false)
      }
    })
  })

  describe('productListQuerySchema', () => {
    it('parses query string values', () => {
      const result = productListQuerySchema.safeParse({
        page: '2',
        limit: '50',
        search: 'para',
        sortBy: 'sku',
        sortOrder: 'desc',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
        expect(result.data.limit).toBe(50)
        expect(result.data.sortBy).toBe('sku')
        expect(result.data.sortOrder).toBe('desc')
      }
    })

    it('applies defaults', () => {
      const result = productListQuerySchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.limit).toBe(20)
        expect(result.data.sortBy).toBe('name')
      }
    })

    it('rejects invalid sortBy', () => {
      const result = productListQuerySchema.safeParse({ sortBy: 'mrp' })
      expect(result.success).toBe(false)
    })
  })

  describe('categoryListQuerySchema', () => {
    it('parses booleans', () => {
      const result = categoryListQuerySchema.safeParse({ isActive: 'false' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isActive).toBe(false)
    })
  })
})
