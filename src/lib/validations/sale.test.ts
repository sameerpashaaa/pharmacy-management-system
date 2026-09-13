import {
  createHeldBillSchema,
  createSaleSchema,
  heldBillListQuerySchema,
  posConfigQuerySchema,
  posItemSchema,
  posPaymentSchema,
  posProductsQuerySchema,
  saleListQuerySchema,
} from '@/lib/validations/sale'

describe('posItemSchema', () => {
  it('accepts exactly one of productId / barcode / sku', () => {
    expect(posItemSchema.parse({ productId: 'p', quantity: 1 })).toMatchObject({
      productId: 'p',
      quantity: 1,
    })
    expect(posItemSchema.parse({ barcode: '8901', quantity: 2 }).barcode).toBe('8901')
    expect(posItemSchema.parse({ sku: 'P-001', quantity: 3 }).sku).toBe('P-001')
  })

  it('rejects multiple or zero identifiers', () => {
    expect(() => posItemSchema.parse({ productId: 'p', barcode: 'x', quantity: 1 })).toThrow()
    expect(() => posItemSchema.parse({ quantity: 1 })).toThrow()
  })

  it('requires a positive integer quantity', () => {
    expect(() => posItemSchema.parse({ productId: 'p', quantity: 0 })).toThrow()
    expect(() => posItemSchema.parse({ productId: 'p', quantity: -1 })).toThrow()
    expect(() => posItemSchema.parse({ productId: 'p', quantity: 1.5 })).toThrow('integer')
  })

  it('clamps discountPercent to 0..100', () => {
    expect(() =>
      posItemSchema.parse({ productId: 'p', quantity: 1, discountPercent: 101 })
    ).toThrow()
    expect(() =>
      posItemSchema.parse({ productId: 'p', quantity: 1, discountPercent: -1 })
    ).toThrow()
  })

  it('strips client-supplied pricing fields', () => {
    const parsed = posItemSchema.parse({
      productId: 'p',
      quantity: 1,
      unitPrice: 1,
      totalAmount: 999,
    })
    expect('unitPrice' in parsed).toBe(false)
    expect('totalAmount' in parsed).toBe(false)
  })
})

describe('posPaymentSchema', () => {
  it('accepts real payment methods only', () => {
    for (const method of ['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'CREDIT', 'WALLET']) {
      expect(posPaymentSchema.parse({ method, amount: 10 }).method).toBe(method)
    }
    expect(() => posPaymentSchema.parse({ method: 'PAYPAL', amount: 10 })).toThrow()
  })

  it('requires a positive amount', () => {
    expect(() => posPaymentSchema.parse({ method: 'CASH', amount: 0 })).toThrow()
    expect(() => posPaymentSchema.parse({ method: 'CASH', amount: -5 })).toThrow()
  })

  it('accepts an optional reference string', () => {
    expect(posPaymentSchema.parse({ method: 'UPI', amount: 5, reference: 'ref' }).reference).toBe(
      'ref'
    )
  })
})

describe('createSaleSchema', () => {
  const valid = {
    branchId: 'b1',
    items: [{ productId: 'p1', quantity: 1 }],
    payments: [{ method: 'CASH', amount: 112 }],
  }

  it('accepts a well-formed sale', () => {
    const parsed = createSaleSchema.parse(valid)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.payments).toHaveLength(1)
  })

  it('rejects empty carts and zero payments', () => {
    expect(() => createSaleSchema.parse({ ...valid, items: [] })).toThrow()
    expect(() => createSaleSchema.parse({ ...valid, payments: [] })).toThrow()
  })

  it('accepts a minimal inline credit customer', () => {
    const parsed = createSaleSchema.parse({
      ...valid,
      customer: { name: 'Raj' },
    })
    expect(parsed.customer).toEqual({ name: 'Raj' })
  })

  it('rejects a customer without a name', () => {
    expect(() => createSaleSchema.parse({ ...valid, customer: { name: '' } })).toThrow(
      'Customer name is required'
    )
  })

  it('rejects brutal customer name lengths', () => {
    expect(() =>
      createSaleSchema.parse({ ...valid, customer: { name: 'x'.repeat(121) } })
    ).toThrow()
  })

  it('strips unknown keys (client cannot smuggle prices)', () => {
    const parsed = createSaleSchema.parse({
      ...valid,
      unitPrice: 1,
      taxAmount: 0,
    } as never) as Record<string, unknown>
    expect('unitPrice' in parsed).toBe(false)
    expect('taxAmount' in parsed).toBe(false)
  })
})

describe('query schemas', () => {
  it('parses list defaults', () => {
    expect(saleListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 })
    expect(saleListQuerySchema.parse({ page: 2, limit: 50 })).toMatchObject({ page: 2, limit: 50 })
    expect(() => saleListQuerySchema.parse({ sortBy: 'bogus' })).toThrow()
    expect(() => saleListQuerySchema.parse({ limit: 500 })).toThrow()
  })

  it('parses pos product search', () => {
    expect(posProductsQuerySchema.parse({}).limit).toBe(20)
    expect(posProductsQuerySchema.parse({ search: 'para', limit: 10 })).toMatchObject({
      search: 'para',
      limit: 10,
    })
    expect(() => posProductsQuerySchema.parse({ limit: 0 })).toThrow()
    expect(() => posProductsQuerySchema.parse({ limit: 200 })).toThrow()
  })

  it('parses pos config and held bill schemas', () => {
    expect(posConfigQuerySchema.parse({})).toEqual({})
    expect(heldBillListQuerySchema.parse({})).toEqual({})
    const held = createHeldBillSchema.parse({
      cartData: { items: [{ productId: 'p', quantity: 1 }] },
      label: 'L',
    })
    expect(held.label).toBe('L')
    // branchId is derived server-side from the actor, never sent in the payload
    expect(createHeldBillSchema.parse({ cartData: {} })).toEqual({ cartData: {} })
  })
})
