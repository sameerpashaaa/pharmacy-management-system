import { computeItemPricing, computeSaleTotals, round2 } from '@/lib/sales/pricing'

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

describe('computeItemPricing (IGST — inter-state)', () => {
  it('uses igstRate when supplied (regression: igstPercent was hardcoded to 0)', () => {
    // Inter-state sale: CGST=0, SGST=0, IGST=18%
    const line = computeItemPricing({
      mrp: 100,
      gstRate: 18,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 18,
      isGstExempt: false,
      taxInclusive: false,
      quantity: 1,
    })
    expect(line.igstPercent).toBe(18)
    expect(line.igstAmount).toBe(18)
    expect(line.cgstAmount).toBe(0)
    expect(line.sgstAmount).toBe(0)
    expect(line.taxableAmount).toBe(100)
    expect(line.totalAmount).toBe(118)
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
