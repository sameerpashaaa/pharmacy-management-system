// ─────────────────────────────────────────────────────────────
// POS — Pure Pricing & GST Math
//
// All money is computed from SERVER-side product values (MRP + GST
// rates). Client input never carries a price, tax or discount
// amount — see `createSale` in sales-service.ts.
//
// Money rule: every computed amount is rounded to 2 decimals with
// `round2` at the LINE level before being summed. Rounding is
// applied once per line, never twice to the same value.
//
// GST: intra-state by default — tax split = cgst + sgst from the
// product's stored rates (`igstPercent` is 0). State-level interstate
// GST requires branch/organization state resolution which is out of
// this phase's scope (documented limitation).
// ─────────────────────────────────────────────────────────────

/** Round a money value to 2 decimals. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface PricingProductInput {
  mrp: number
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  isGstExempt: boolean
}

export interface ItemPricingInput extends PricingProductInput {
  quantity: number
  /** 0..100, applied on the MRP (gross) value. Default 0. */
  discountPercent?: number
  /** `gst.tax_inclusive` — are stored prices inclusive of GST? */
  taxInclusive: boolean
}

export interface ItemPricingRow {
  quantity: number
  unitPrice: number
  grossAmount: number
  discountPercent: number
  discountAmount: number
  /** Price after discount, before GST. */
  lineAmount: number
  taxPercent: number
  cgstPercent: number
  sgstPercent: number
  igstPercent: number
  /** Base value on which GST is computed. */
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  taxAmount: number
  /** Final line total including GST. */
  totalAmount: number
}

export interface SaleTotalsOptions {
  taxInclusive: boolean
  /** `pos.round_off_total` — round the invoice total to the nearest rupee. */
  roundOffTotal: boolean
}

export interface SaleTotals {
  subtotal: number
  discountAmount: number
  /** Aggregate discount percent (discountAmount / subtotal), informative. */
  discountPercent: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  taxAmount: number
  /** Final invoice total (after optional round-off). */
  totalAmount: number
  /** True pre-round-off total; equals totalAmount when round-off is off. */
  rawTotalAmount: number
  /** Difference totalAmount - rawTotalAmount (negative when rounded down). */
  roundOffDifference: number
}

/**
 * Price a single cart line. Pure — no database access.
 */
export function computeItemPricing(input: ItemPricingInput): ItemPricingRow {
  const quantity = input.quantity
  const unitPrice = round2(input.mrp)
  const grossAmount = round2(unitPrice * quantity)

  const discountPercent = input.discountPercent ?? 0
  const discountAmount = round2((grossAmount * discountPercent) / 100)
  const lineAmount = round2(grossAmount - discountAmount)

  const exempt = input.isGstExempt
  const cgstPercent = exempt ? 0 : input.cgstRate
  const sgstPercent = exempt ? 0 : input.sgstRate
  const igstPercent = exempt ? 0 : input.igstRate
  const taxPercent = exempt ? 0 : input.cgstRate + input.sgstRate + input.igstRate

  if (exempt || taxPercent === 0) {
    return {
      quantity,
      unitPrice,
      grossAmount,
      discountPercent,
      discountAmount,
      lineAmount,
      taxPercent,
      cgstPercent,
      sgstPercent,
      igstPercent,
      taxableAmount: round2(lineAmount),
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxAmount: 0,
      totalAmount: round2(lineAmount),
    }
  }

  if (input.taxInclusive) {
    // MRP includes GST. Back out the taxable base and the embedded tax.
    const taxableAmount = round2(lineAmount / (1 + taxPercent / 100))
    const cgstAmount = round2((taxableAmount * cgstPercent) / 100)
    const sgstAmount = round2((taxableAmount * sgstPercent) / 100)
    const igstAmount = round2((taxableAmount * igstPercent) / 100)
    const taxAmount = round2(cgstAmount + sgstAmount + igstAmount)
    return {
      quantity,
      unitPrice,
      grossAmount,
      discountPercent,
      discountAmount,
      lineAmount,
      taxPercent,
      cgstPercent,
      sgstPercent,
      igstPercent,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount,
      totalAmount: round2(lineAmount),
    }
  }

  // GST exclusive (default): tax is added on top of the discounted value.
  const taxableAmount = round2(lineAmount)
  const cgstAmount = round2((taxableAmount * cgstPercent) / 100)
  const sgstAmount = round2((taxableAmount * sgstPercent) / 100)
  const igstAmount = round2((taxableAmount * igstPercent) / 100)
  const taxAmount = round2(cgstAmount + sgstAmount + igstAmount)
  return {
    quantity,
    unitPrice,
    grossAmount,
    discountPercent,
    discountAmount,
    lineAmount,
    taxPercent,
    cgstPercent,
    sgstPercent,
    igstPercent,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    totalAmount: round2(taxableAmount + taxAmount),
  }
}

/**
 * Aggregate priced lines into invoice totals. Pure — no database access.
 *
 * When `roundOffTotal` is enabled the FINAL `totalAmount` is rounded to
 * the nearest rupee (standard Indian retail practice). The schema has no
 * round-off column, so `totalAmount` stores the generated (rounded)
 * invoice total and `rawTotalAmount`/`roundOffDifference` make the
 * adjustment transparent.
 */
export function computeSaleTotals(lines: ItemPricingRow[], opts: SaleTotalsOptions): SaleTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.grossAmount, 0))
  const discountAmount = round2(lines.reduce((s, l) => s + l.discountAmount, 0))
  const cgstAmount = round2(lines.reduce((s, l) => s + l.cgstAmount, 0))
  const sgstAmount = round2(lines.reduce((s, l) => s + l.sgstAmount, 0))
  const igstAmount = round2(lines.reduce((s, l) => s + l.igstAmount, 0))
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0))
  const rawTotalAmount = round2(lines.reduce((s, l) => s + l.totalAmount, 0))

  const discountPercent = subtotal > 0 ? round2((discountAmount / subtotal) * 100) : 0

  const totalAmount = opts.roundOffTotal ? Math.round(rawTotalAmount) : rawTotalAmount
  const roundOffDifference = round2(totalAmount - rawTotalAmount)

  return {
    subtotal,
    discountAmount,
    discountPercent,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    totalAmount,
    rawTotalAmount,
    roundOffDifference,
  }
}
