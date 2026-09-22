import { createGrnSchema } from '@/lib/validations/purchase'

function validGrnPayload() {
  return {
    purchaseId: 'po-1',
    branchId: 'br-1',
    grnNumber: 'GRN-1',
    grnDate: '2026-09-19T00:00:00.000Z',
    items: [
      {
        purchaseItemId: 'pi-1',
        receivedQuantity: 10,
        batchNumber: 'BT-1',
        expiryDate: '2027-09-19T00:00:00.000Z',
        purchasePrice: 10,
        mrp: 100,
        qualityCheckPassed: true,
      },
    ],
  }
}

describe('GRN datetime contract (createGrnSchema)', () => {
  it('accepts ISO 8601 datetimes with a Z offset (frontend normalized format)', () => {
    const parsed = createGrnSchema.parse(validGrnPayload())
    expect(parsed.grnDate).toBe('2026-09-19T00:00:00.000Z')
    expect(parsed.items[0].expiryDate).toBe('2027-09-19T00:00:00.000Z')
  })

  it('accepts ISO 8601 datetimes with an explicit numeric offset', () => {
    const payload = validGrnPayload()
    payload.grnDate = '2026-09-19T00:00:00+05:30'
    payload.items[0].expiryDate = '2027-09-19T00:00:00-07:00'
    expect(() => createGrnSchema.parse(payload)).not.toThrow()
  })

  it('rejects a date-only grnDate (old frontend YYYY-MM-DD format)', () => {
    const payload = validGrnPayload()
    payload.grnDate = '2026-09-19'
    expect(() => createGrnSchema.parse(payload)).toThrow()
  })

  it('rejects a date-only item expiryDate (old frontend YYYY-MM-DD format)', () => {
    const payload = validGrnPayload()
    payload.items[0].expiryDate = '2027-09-19'
    expect(() => createGrnSchema.parse(payload)).toThrow()
  })

  it('rejects datetimes without any timezone offset', () => {
    const payload = validGrnPayload()
    payload.grnDate = '2026-09-19T10:30:00'
    expect(() => createGrnSchema.parse(payload)).toThrow()
  })

  it('rejects non-datetime garbage values', () => {
    const payload = validGrnPayload()
    payload.grnDate = 'not-a-date'
    expect(() => createGrnSchema.parse(payload)).toThrow()
  })

  it('rejects a missing grnDate', () => {
    const { grnDate, ...rest } = validGrnPayload()
    expect(grnDate).toBeDefined()
    expect(() => createGrnSchema.parse(rest)).toThrow()
  })
})
