import { productImportRowSchema } from '@/lib/validations/product'

describe('productImportRowSchema', () => {
  it('applies defaults for a minimal valid row', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Paracetamol 500mg',
      sku: 'PCM-500',
      mrp: '25.00',
      categories: 'analgesics',
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.mrp).toBe(25)
    expect(res.data.drugSchedule).toBe('NONE')
    expect(res.data.gstRate).toBe(12)
    expect(res.data.cgstRate).toBe(6)
    expect(res.data.sgstRate).toBe(6)
    expect(res.data.igstRate).toBe(12)
    expect(res.data.isPrescriptionRequired).toBe(false)
    expect(res.data.isGstExempt).toBe(false)
    expect(res.data.unitOfMeasure).toBe('Strip')
    expect(res.data.minStockLevel).toBe(10)
    expect(res.data.reorderLevel).toBe(20)
    expect(res.data.isActive).toBe(true)
    expect(res.data.isReturnable).toBe(true)
  })

  it('coerces numeric and boolean strings without mangling invalid values', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Cough Syrup',
      sku: 'SYR-1',
      mrp: '99.50',
      gstRate: '5',
      cgstRate: '2.5',
      sgstRate: '2.5',
      igstRate: '5',
      ptr: '80',
      costPrice: '70',
      tabsPerStrip: '10',
      minStockLevel: '5',
      maxStockLevel: '200',
      reorderLevel: '8',
      isPrescriptionRequired: 'true',
      isGstExempt: 'yes',
      isActive: '1',
      categories: 'syrups',
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.mrp).toBe(99.5)
    expect(res.data.ptr).toBe(80)
    expect(res.data.costPrice).toBe(70)
    expect(res.data.tabsPerStrip).toBe(10)
    expect(res.data.maxStockLevel).toBe(200)
    expect(res.data.isPrescriptionRequired).toBe(true)
    expect(res.data.isGstExempt).toBe(true)
    expect(res.data.isActive).toBe(true)
  })

  it('normalizes drug schedule values case-insensitively', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Amoxicillin',
      sku: 'AMX-500',
      mrp: '85',
      drugSchedule: 'h',
      categories: 'antibiotics',
    })
    expect(res.success).toBe(true)
    expect(res.success && res.data.drugSchedule).toBe('H')
  })

  it('treats empty optional numerics as unspecified', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Vitamin Tablets',
      sku: 'VIT-1',
      mrp: '12',
      ptr: '',
      costPrice: '',
      maxStockLevel: '',
      tabsPerStrip: '',
      categories: 'supplements',
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.ptr).toBeUndefined()
    expect(res.data.costPrice).toBeUndefined()
    expect(res.data.maxStockLevel).toBeUndefined()
    expect(res.data.tabsPerStrip).toBeUndefined()
  })

  it('rejects a missing required MRP', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects a non-numeric MRP instead of coercing it to 0', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: 'abc',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.issues.some((i) => i.path[0] === 'mrp')).toBe(true)
  })

  it('rejects lowercase SKUs (must be uppercase)', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'pcm-500',
      mrp: '10',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid barcode characters', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      barcode: '89**123',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects an invalid boolean value', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      isPrescriptionRequired: 'banana',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects an unknown drug schedule', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      drugSchedule: 'ZZZ',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects out-of-range GST rates', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      gstRate: '101',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects non-integer tabs-per-strip', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      tabsPerStrip: '2.5',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })

  it('rejects missing categories', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      categories: '',
    })
    expect(res.success).toBe(false)
  })

  it('rejects an invalid image URL', () => {
    const res = productImportRowSchema.safeParse({
      name: 'Test',
      sku: 'TST-1',
      mrp: '10',
      imageUrl: 'not-a-url',
      categories: 'analgesics',
    })
    expect(res.success).toBe(false)
  })
})
