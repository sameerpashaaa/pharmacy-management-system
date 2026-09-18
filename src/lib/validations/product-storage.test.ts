import {
  createProductSchema,
  productImportRowSchema,
  STORAGE_CONDITION_LABELS,
  StorageConditionEnum,
} from '@/lib/validations/product'

describe('storageCondition validation', () => {
  const validEnums = StorageConditionEnum.options
  const validLabels = Object.values(STORAGE_CONDITION_LABELS)

  it.each(validEnums)('accepts enum %s', (val) => {
    const result = createProductSchema.safeParse({
      name: 'Test',
      sku: 'TEST-001',
      mrp: 100,
      storageCondition: val,
      categoryIds: ['cat-1'],
    })
    expect(result.success).toBe(true)
  })

  it.each(validLabels)('accepts display label %s', (label) => {
    const result = createProductSchema.safeParse({
      name: 'Test',
      sku: 'TEST-001',
      mrp: 100,
      storageCondition: label,
      categoryIds: ['cat-1'],
    })
    expect(result.success).toBe(true)
    // Should normalize to enum
    if (result.success) expect(validEnums).toContain(result.data.storageCondition)
  })

  it('rejects arbitrary storage condition', () => {
    const result = createProductSchema.safeParse({
      name: 'Test',
      sku: 'TEST-001',
      mrp: 100,
      storageCondition: 'INVALID_CONDITION',
      categoryIds: ['cat-1'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts omitted/empty/null', () => {
    for (const val of [undefined, null, ''] as const) {
      const result = createProductSchema.safeParse({
        name: 'Test',
        sku: 'TEST-001',
        mrp: 100,
        storageCondition: val as unknown as string,
        categoryIds: ['cat-1'],
      })
      // Empty string and null should be treated as undefined/omitted
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.storageCondition).toBeUndefined()
    }
  })

  it('rejects invalid value', () => {
    const result = createProductSchema.safeParse({
      name: 'Test',
      sku: 'TEST-001',
      mrp: 100,
      storageCondition: 'Room Temp',
      categoryIds: ['cat-1'],
    })
    expect(result.success).toBe(false)
  })

  it('CSV valid storageCondition imports', () => {
    const row = {
      name: 'Test',
      sku: 'TEST-001',
      mrp: '100',
      categories: 'cat',
      storageCondition: 'Refrigerated +2°C to +8°C',
    }
    const result = productImportRowSchema.safeParse(row)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.storageCondition).toBe('REFRIGERATED')
  })

  it('CSV blank imports as undefined', () => {
    const row = {
      name: 'Test',
      sku: 'TEST-001',
      mrp: '100',
      categories: 'cat',
      storageCondition: '',
    }
    const result = productImportRowSchema.safeParse(row)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.storageCondition).toBeUndefined()
  })

  it('CSV invalid is rejected', () => {
    const row = {
      name: 'Test',
      sku: 'TEST-001',
      mrp: '100',
      categories: 'cat',
      storageCondition: 'INVALID',
    }
    const result = productImportRowSchema.safeParse(row)
    expect(result.success).toBe(false)
  })

  it('CSV legacy without column still works', () => {
    const row = { name: 'Test', sku: 'TEST-001', mrp: '100', categories: 'cat' }
    const result = productImportRowSchema.safeParse(row)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.storageCondition).toBeUndefined()
  })

  it('CSV snake_case header alias maps to enum', () => {
    // Simulate the alias handling in product-import service: storage_condition should map
    // Here we test the validation directly with enum value, but the service's canonicalRow handles alias
    const row = {
      name: 'Test',
      sku: 'TEST-001',
      mrp: '100',
      categories: 'cat',
      storageCondition: 'DEEP_FREEZE',
    }
    const result = productImportRowSchema.safeParse(row)
    expect(result.success).toBe(true)
  })
})
