import prisma from '@/lib/db/prisma'
import {
  DEFAULT_POS_SETTINGS,
  getPosSettings,
  getSystemSettingsMap,
} from '@/lib/settings/settings-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    systemSetting: { findMany: jest.fn() },
  },
}))

const prismaMock = prisma as unknown as { systemSetting: { findMany: jest.Mock } }
const mockedFindMany = prismaMock.systemSetting.findMany

describe('getSystemSettingsMap', () => {
  afterEach(() => jest.clearAllMocks())

  it('returns a category.key → value map', async () => {
    mockedFindMany.mockResolvedValue([
      { category: 'pos', key: 'max_discount_percent', value: '25' },
      { category: 'inventory', key: 'fefo_enabled', value: 'true' },
    ])
    await expect(getSystemSettingsMap()).resolves.toEqual({
      'pos.max_discount_percent': '25',
      'inventory.fefo_enabled': 'true',
    })
  })
})

describe('getPosSettings', () => {
  afterEach(() => jest.clearAllMocks())

  it('falls back to seeded defaults when the table is empty', async () => {
    mockedFindMany.mockResolvedValue([])
    await expect(getPosSettings()).resolves.toEqual(DEFAULT_POS_SETTINGS)
  })

  it('parses typed values from string rows', async () => {
    mockedFindMany.mockResolvedValue([
      { category: 'pos', key: 'max_discount_percent', value: '30' },
      { category: 'pos', key: 'round_off_total', value: 'false' },
      { category: 'pos', key: 'allow_credit_sales', value: 'true' },
      { category: 'pos', key: 'require_customer_for_credit', value: 'true' },
      { category: 'pos', key: 'invoice_type', value: 'a4' },
      { category: 'pos', key: 'auto_print_invoice', value: '1' },
      { category: 'inventory', key: 'fefo_enabled', value: 'false' },
      { category: 'inventory', key: 'negative_stock', value: 'true' },
      { category: 'gst', key: 'tax_inclusive', value: 'true' },
    ])
    await expect(getPosSettings()).resolves.toEqual({
      maxDiscountPercent: 30,
      roundOffTotal: false,
      allowCreditSales: true,
      requireCustomerForCredit: true,
      invoiceType: 'a4',
      autoPrintInvoice: true,
      fefoEnabled: false,
      negativeStock: true,
      taxInclusive: true,
      // Not seeded in the rows above — falls back to DEFAULT_POS_SETTINGS.
      lowStockThreshold: DEFAULT_POS_SETTINGS.lowStockThreshold,
    })
  })

  it('tolerates malformed numbers', async () => {
    mockedFindMany.mockResolvedValue([
      { category: 'pos', key: 'max_discount_percent', value: 'not-a-number' },
    ])
    const settings = await getPosSettings()
    expect(settings.maxDiscountPercent).toBe(DEFAULT_POS_SETTINGS.maxDiscountPercent)
  })

  it('treats unknown invoice types as the default', async () => {
    mockedFindMany.mockResolvedValue([{ category: 'pos', key: 'invoice_type', value: 'label' }])
    await expect(getPosSettings()).resolves.toMatchObject({ invoiceType: 'thermal' })
  })
})
