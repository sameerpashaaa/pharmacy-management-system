import {
  createLedgerEntrySchema,
  createLedgerSchema,
  fileGstPeriodSchema,
  financeDateRangeSchema,
  gstReportQuerySchema,
  gstSyncSchema,
  ledgerListQuerySchema,
  partyLedgerQuerySchema,
  partyStatementQuerySchema,
  recordPartyPaymentSchema,
} from './finance'

describe('Finance & GST Validation Schemas', () => {
  describe('financeDateRangeSchema', () => {
    it('accepts valid date range', () => {
      const parsed = financeDateRangeSchema.parse({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
      })
      expect(parsed.from).toBe('2026-09-01T00:00:00.000Z')
    })

    it('rejects if from is after to', () => {
      expect(() =>
        financeDateRangeSchema.parse({
          from: '2026-09-30T00:00:00.000Z',
          to: '2026-09-01T00:00:00.000Z',
        })
      ).toThrow('From date must be before or equal to to date')
    })
  })

  describe('createLedgerSchema', () => {
    it('validates a correct ledger input', () => {
      const parsed = createLedgerSchema.parse({
        code: '1090',
        name: 'Office Equipment',
        type: 'ASSET',
        openingBalance: 5000,
      })
      expect(parsed.code).toBe('1090')
      expect(parsed.type).toBe('ASSET')
      expect(parsed.openingBalance).toBe(5000)
    })

    it('rejects missing code or name', () => {
      expect(() =>
        createLedgerSchema.parse({
          code: '',
          name: 'Invalid Account',
          type: 'EXPENSE',
        })
      ).toThrow()
    })
  })

  describe('createLedgerEntrySchema', () => {
    it('validates a journal entry', () => {
      const parsed = createLedgerEntrySchema.parse({
        ledgerId: 'led-1',
        type: 'DEBIT',
        amount: 250.5,
        description: 'Courier charges',
      })
      expect(parsed.amount).toBe(250.5)
      expect(parsed.type).toBe('DEBIT')
    })

    it('rejects negative or zero amount', () => {
      expect(() =>
        createLedgerEntrySchema.parse({
          ledgerId: 'led-1',
          type: 'DEBIT',
          amount: 0,
          description: 'Zero amount',
        })
      ).toThrow('Amount must be positive')
    })
  })

  describe('recordPartyPaymentSchema', () => {
    it('accepts valid payment settlement', () => {
      const parsed = recordPartyPaymentSchema.parse({
        amount: 1500,
        paymentMethod: 'UPI',
        reference: 'UPI-TXN-123456',
        notes: 'Partial settlement',
      })
      expect(parsed.amount).toBe(1500)
      expect(parsed.paymentMethod).toBe('UPI')
    })

    it('rejects non-positive payment', () => {
      expect(() =>
        recordPartyPaymentSchema.parse({
          amount: -50,
          paymentMethod: 'CASH',
        })
      ).toThrow('Amount must be positive')
    })
  })

  describe('fileGstPeriodSchema', () => {
    it('accepts MM-YYYY return period', () => {
      const parsed = fileGstPeriodSchema.parse({
        returnPeriod: '09-2026',
      })
      expect(parsed.returnPeriod).toBe('09-2026')
    })

    it('rejects invalid format', () => {
      expect(() =>
        fileGstPeriodSchema.parse({
          returnPeriod: '2026-09',
        })
      ).toThrow('Return period must be MM-YYYY')
    })
  })

  describe('gstSyncSchema', () => {
    it('accepts empty or branch-filtered sync options', () => {
      const parsed = gstSyncSchema.parse({ branchId: 'br-1' })
      expect(parsed.branchId).toBe('br-1')
    })
  })

  describe('ledgerListQuerySchema', () => {
    it('defaults pagination and accepts search filter', () => {
      const parsed = ledgerListQuerySchema.parse({ search: 'bank' })
      expect(parsed.page).toBe(1)
      expect(parsed.limit).toBe(20)
      expect(parsed.search).toBe('bank')
    })
  })

  describe('partyLedgerQuerySchema', () => {
    it('parses party query parameters', () => {
      const parsed = partyLedgerQuerySchema.parse({ status: 'OUTSTANDING' })
      expect(parsed.status).toBe('OUTSTANDING')
      expect(parsed.sortBy).toBe('outstandingBalance')
    })
  })

  describe('partyStatementQuerySchema', () => {
    it('parses statement pagination and date filters', () => {
      const parsed = partyStatementQuerySchema.parse({ limit: 10 })
      expect(parsed.limit).toBe(10)
      expect(parsed.page).toBe(1)
    })
  })

  describe('gstReportQuerySchema', () => {
    it('parses GST query filters with MM-YYYY period', () => {
      const parsed = gstReportQuerySchema.parse({ returnPeriod: '09-2026', filed: 'true' })
      expect(parsed.returnPeriod).toBe('09-2026')
      expect(parsed.filed).toBe(true)
    })
  })
})
