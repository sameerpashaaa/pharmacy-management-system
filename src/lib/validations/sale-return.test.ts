import {
  createSaleReturnSchema,
  creditNoteQuerySchema,
  saleReturnQuerySchema,
} from '@/lib/validations/sale-return'

describe('Sale Return & Credit Note Validation Schemas', () => {
  describe('createSaleReturnSchema', () => {
    it('accepts valid sale return data', () => {
      const valid = {
        saleId: 'sale-1',
        reason: 'Prescription changed by physician',
        refundMethod: 'CASH' as const,
        notes: 'Inspected and sealed',
        items: [
          {
            saleItemId: 'item-1',
            quantity: 2,
            reason: 'Unopened blister pack',
            restockDecision: 'RESTOCK' as const,
          },
        ],
      }
      const parsed = createSaleReturnSchema.parse(valid)
      expect(parsed.saleId).toBe('sale-1')
      expect(parsed.items).toHaveLength(1)
      expect(parsed.items[0].restockDecision).toBe('RESTOCK')
    })

    it('rejects empty items array', () => {
      expect(() =>
        createSaleReturnSchema.parse({
          saleId: 'sale-1',
          reason: 'Wrong item',
          refundMethod: 'CASH',
          items: [],
        })
      ).toThrow('At least one item must be returned')
    })

    it('rejects non-positive quantity', () => {
      expect(() =>
        createSaleReturnSchema.parse({
          saleId: 'sale-1',
          reason: 'Wrong item',
          refundMethod: 'CASH',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 0,
            },
          ],
        })
      ).toThrow()
    })

    it('rejects invalid refundMethod', () => {
      expect(() =>
        createSaleReturnSchema.parse({
          saleId: 'sale-1',
          reason: 'Wrong item',
          refundMethod: 'BITCOIN',
          items: [
            {
              saleItemId: 'item-1',
              quantity: 1,
            },
          ],
        })
      ).toThrow()
    })
  })

  describe('saleReturnQuerySchema', () => {
    it('defaults pagination correctly', () => {
      const parsed = saleReturnQuerySchema.parse({})
      expect(parsed.page).toBe(1)
      expect(parsed.limit).toBe(20)
      expect(parsed.sortBy).toBe('createdAt')
      expect(parsed.sortOrder).toBe('desc')
    })
  })

  describe('creditNoteQuerySchema', () => {
    it('accepts status filters', () => {
      const parsed = creditNoteQuerySchema.parse({ status: 'ACTIVE' })
      expect(parsed.status).toBe('ACTIVE')
    })
  })
})
