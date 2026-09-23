import { computeItemPricing, computeLooseUnitBreakdown, computeSaleTotals, round2 } from '@/lib/sales/pricing'

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(0)).toBe(0)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(31.5)).toBe(31.5)
    expect(round2(2.345)).toBe(2.35)
  })
})

describe('computeItemPricing (GST exclusive — default)', () => {
  const base = {
    mrp: 100,
    gstRate: 12,
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    isGstExempt: false,
    taxInclusive: false,
  }

  it('computes gross, tax split and final total for a line', () => {
    const line = computeItemPricing({ ...base, quantity: 2 })
    expect(line).toMatchObject({
      unitPrice: 100,
      grossAmount: 200,
      discountAmount: 0,
      lineAmount: 200,
      taxableAmount: 200,
      cgstAmount: 12,
      sgstAmount: 12,
      igstAmount: 0,
      taxAmount: 24,
      totalAmount: 224,
    })
  })

  it('applies discount on the MRP before GST', () => {
    const line = computeItemPricing({ ...base, quantity: 1, discountPercent: 10 })
    expect(line.grossAmount).toBe(100)
    expect(line.discountAmount).toBe(10)
    expect(line.lineAmount).toBe(90)
    expect(line.taxableAmount).toBe(90)
    expect(line.cgstAmount).toBe(5.4)
    expect(line.sgstAmount).toBe(5.4)
    expect(line.taxAmount).toBe(10.8)
    expect(line.totalAmount).toBe(100.8)
  })

  it('zeroes tax for GST-exempt products', () => {
    const line = computeItemPricing({ ...base, isGstExempt: true, quantity: 1 })
    expect(line.taxAmount).toBe(0)
    expect(line.cgstAmount).toBe(0)
    expect(line.totalAmount).toBe(100)
  })

  it('zeroes tax when the stored GST rate is 0', () => {
    const line = computeItemPricing({ ...base, cgstRate: 0, sgstRate: 0, gstRate: 0, quantity: 3 })
    expect(line.taxPercent).toBe(0)
    expect(line.totalAmount).toBe(300)
  })
})

describe('computeItemPricing (tax inclusive)', () => {
  it('backs out the embedded tax without changing the line total', () => {
    const line = computeItemPricing({
      mrp: 112,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 0,
      isGstExempt: false,
      taxInclusive: true,
      quantity: 1,
    })
    expect(line.lineAmount).toBe(112)
    expect(line.taxableAmount).toBe(100)
    expect(line.taxAmount).toBe(12)
    expect(line.totalAmount).toBe(112)
  })
})

describe('computeSaleTotals', () => {
  const a = computeItemPricing({
    mrp: 100,
    gstRate: 12,
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    isGstExempt: false,
    taxInclusive: false,
    quantity: 1,
  }) // 112
  const b = computeItemPricing({
    mrp: 50,
    gstRate: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    isGstExempt: false,
    taxInclusive: false,
    quantity: 1,
  }) // 50

  it('aggregates line totals and tax', () => {
    const totals = computeSaleTotals([a, b], { taxInclusive: false, roundOffTotal: false })
    expect(totals.subtotal).toBe(150)
    expect(totals.taxAmount).toBe(12)
    expect(totals.cgstAmount).toBe(6)
    expect(totals.sgstAmount).toBe(6)
    expect(totals.rawTotalAmount).toBe(162)
    expect(totals.totalAmount).toBe(162)
    expect(totals.roundOffDifference).toBe(0)
  })

  it('rounds the final total to the nearest rupee when enabled', () => {
    const c = computeItemPricing({
      mrp: 10.5,
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      isGstExempt: false,
      taxInclusive: false,
      quantity: 3,
    }) // 31.5
    const totals = computeSaleTotals([c], { taxInclusive: false, roundOffTotal: true })
    expect(totals.rawTotalAmount).toBe(31.5)
    expect(totals.totalAmount).toBe(32)
    expect(totals.roundOffDifference).toBe(0.5)
  })

  it('derives an informative aggregate discount percent', () => {
    const d = computeItemPricing({
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 0,
      isGstExempt: false,
      taxInclusive: false,
      quantity: 1,
      discountPercent: 10,
    })
    const totals = computeSaleTotals([d], { taxInclusive: false, roundOffTotal: false })
    expect(totals.discountAmount).toBe(10)
    expect(totals.discountPercent).toBe(10)
  })
})

describe('computeLooseUnitBreakdown', () => {
  it('whole-strip line deducts only the strip count', () => {
    expect(
      computeLooseUnitBreakdown({ quantity: 3, looseUnits: 0, tabsPerStrip: 10 })
    ).toEqual({ stripsToDeduct: 3, billableQuantity: 3, totalBaseQty: 30 })
  })

  it('loose tabs open one extra strip and price pro-rata', () => {
    expect(
      computeLooseUnitBreakdown({ quantity: 1, looseUnits: 3, tabsPerStrip: 10 })
    ).toEqual({
      stripsToDeduct: 2,
      billableQuantity: 1.3,
      totalBaseQty: 13,
    })
  })

  it('non-tab products cannot dispense loose units', () => {
    expect(
      computeLooseUnitBreakdown({ quantity: 1, looseUnits: 1, tabsPerStrip: null })
    ).toBeNull()
    expect(
      computeLooseUnitBreakdown({ quantity: 1, looseUnits: 1, tabsPerStrip: 1 })
    ).toBeNull()
  })

  it('loose units must be 0..tabsPerStrip-1', () => {
    expect(
      computeLooseUnitBreakdown({ quantity: 1, looseUnits: 10, tabsPerStrip: 10 })
    ).toBeNull()
    expect(
      computeLooseUnitBreakdown({ quantity: 1, looseUnits: -1, tabsPerStrip: 10 })
    ).toBeNull()
  })

  it('empty lines are rejected', () => {
    expect(
      computeLooseUnitBreakdown({ quantity: 0, looseUnits: 0, tabsPerStrip: 10 })
    ).toBeNull()
  })
})

describe('computeItemPricing — taxMode (H8)', () => {
  const base = {
    mrp: 100,
    gstRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    isGstExempt: false,
    taxInclusive: false,
  }

  it('intra-state charges cgst + sgst (H8 default)', () => {
    const line = computeItemPricing({ ...base, quantity: 1 })
    expect(line.cgstPercent).toBe(9)
    expect(line.sgstPercent).toBe(9)
    expect(line.igstPercent).toBe(0)
    expect(line.cgstAmount).toBe(9)
    expect(line.sgstAmount).toBe(9)
    expect(line.igstAmount).toBe(0)
    expect(line.taxAmount).toBe(18)
  })

  it('interstate charges a single igst component (H8)', () => {
    const line = computeItemPricing({ ...base, quantity: 1, taxMode: 'INTERSTATE' })
    expect(line.cgstPercent).toBe(0)
    expect(line.sgstPercent).toBe(0)
    expect(line.igstPercent).toBe(18)
    expect(line.cgstAmount).toBe(0)
    expect(line.sgstAmount).toBe(0)
    expect(line.igstAmount).toBe(18)
    expect(line.taxAmount).toBe(18)
  })

  it('interstate + GST exempt still produces zero tax', () => {
    const line = computeItemPricing({
      ...base,
      quantity: 1,
      taxMode: 'INTERSTATE',
      isGstExempt: true,
    })
    expect(line.cgstAmount + line.sgstAmount + line.igstAmount).toBe(0)
    expect(line.taxAmount).toBe(0)
  })

  it('interstate + tax-inclusive back-outs the embedded IGST correctly', () => {
    const line = computeItemPricing({
      ...base,
      quantity: 1,
      taxMode: 'INTERSTATE',
      taxInclusive: true,
    })
    // 100 includes 18% IGST → taxable = 100/1.18 = 84.75 (rounded)
    expect(line.taxableAmount).toBeCloseTo(84.75, 2)
    expect(line.igstAmount).toBeCloseTo(15.26, 2)
    expect(line.cgstAmount).toBe(0)
    expect(line.sgstAmount).toBe(0)
    expect(line.taxAmount).toBeCloseTo(15.26, 2)
  })
})
