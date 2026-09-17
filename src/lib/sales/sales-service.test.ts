import type { Prisma, PaymentStatus } from '@prisma/client'

import type { BatchStatusValue, FefoBatchCandidate } from '@/lib/batches/fefo'
import prisma from '@/lib/db/prisma'
import { assertBranchAccess } from '@/lib/inventory/branch-access'
import {
  allocateByCreationDate,
  buildInvoiceNumber,
  cashReceived,
  createSale,
  derivePaymentStatus,
  type SaleActor,
} from '@/lib/sales/sales-service'
import { getPosSettings, type PosSettings } from '@/lib/settings/settings-service'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    sale: { findMany: jest.fn(), count: jest.fn() },
    saleItem: { count: jest.fn() },
    branch: { findUnique: jest.fn() },
    heldBill: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    ledger: { count: jest.fn().mockResolvedValue(1) },
  },
}))

jest.mock('@/lib/settings/settings-service', () => ({
  __esModule: true,
  getPosSettings: jest.fn(),
  DEFAULT_POS_SETTINGS: {
    autoPrintInvoice: false,
    invoiceType: 'thermal',
    maxDiscountPercent: 20,
    allowCreditSales: true,
    requireCustomerForCredit: true,
    roundOffTotal: true,
    fefoEnabled: true,
    negativeStock: false,
    taxInclusive: false,
  },
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  __esModule: true,
  assertBranchAccess: jest.fn().mockResolvedValue(undefined),
  resolveBranchScope: jest.fn(),
  getAccessibleBranches: jest.fn(),
}))

const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock
}

const mockedSettings = getPosSettings as jest.MockedFunction<typeof getPosSettings>
const mockedBranchAccess = assertBranchAccess as jest.MockedFunction<typeof assertBranchAccess>

const DEFAULT_SETTINGS: PosSettings = {
  autoPrintInvoice: false,
  invoiceType: 'thermal',
  maxDiscountPercent: 20,
  allowCreditSales: true,
  requireCustomerForCredit: true,
  roundOffTotal: true,
  fefoEnabled: true,
  negativeStock: false,
  taxInclusive: false,
}

const actor: SaleActor = {
  id: 'user-1',
  branchId: 'branch-A',
  permissions: ['sales:create', 'sales:read', 'sales:discount', 'sales:credit'],
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Paracetamol 500mg',
    sku: 'P-001',
    barcode: '89010001',
    isActive: true,
    isPrescriptionRequired: false,
    drugSchedule: 'NONE',
    mrp: 100,
    gstRate: 12,
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    isGstExempt: false,
    hsnCode: null,
    unitOfMeasure: 'Strip',
    ...overrides,
  }
}

type BatchFixture = Partial<{
  id: string
  batchNumber: string
  productId: string
  quantity: number
  reservedQuantity: number
  soldQuantity: number
  status: BatchStatusValue
  expiryDate: Date
  branchId: string | null
  mrp: number
  createdAt: Date
}>

function makeBatch<T extends BatchFixture = Record<string, never>>(overrides: T = {} as T) {
  return {
    id: 'batch-1',
    batchNumber: 'BT-1',
    productId: 'prod-1',
    quantity: 10,
    reservedQuantity: 0,
    soldQuantity: 0,
    status: 'ACTIVE',
    expiryDate: new Date('2027-01-01'),
    branchId: 'branch-A',
    mrp: 100,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as FefoBatchCandidate & { createdAt: Date }
}

type RxFixture = { id: string; branchId: string } | null

function makeState(overrides: Record<string, unknown> = {}) {
  const batches = [makeBatch()]
  return {
    branch: { id: 'branch-A', code: 'A', invoicePrefix: 'INV', invoiceCounter: 1 },
    product: makeProduct(),
    inventory: {
      id: 'inv-1',
      productId: 'prod-1',
      branchId: 'branch-A',
      totalQuantity: 10,
      availableQuantity: 10,
      updatedAt: new Date('2026-01-01'),
    },
    batches,
    rx: null as RxFixture,
    customer: null,
    ...overrides,
  }
}

type TxShape = ReturnType<typeof makeFakeTx>['tx']

function makeFakeTx(state: ReturnType<typeof makeState>) {
  const calls: {
    batchUpdateMany: {
      where: Prisma.BatchUpdateManyMutationInput | Record<string, unknown>
      data: unknown
    }[]
    inventoryUpdateMany: { where: Record<string, unknown>; data: unknown }[]
    branchUpdateMany: { where: Record<string, unknown>; data: unknown }[]
  } = { batchUpdateMany: [], inventoryUpdateMany: [], branchUpdateMany: [] }

  const tx = {
    branch: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.branch.id === where.id ? state.branch : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; invoiceCounter: number }
        data: { invoiceCounter: number }
      }) => {
        calls.branchUpdateMany.push({ where, data })
        if (state.branch.id === where.id && state.branch.invoiceCounter === where.invoiceCounter) {
          state.branch.invoiceCounter = data.invoiceCounter
          return { count: 1 }
        }
        return { count: 0 }
      },
    },
    product: {
      findUnique: async ({ where }: { where: { id?: string; barcode?: string; sku?: string } }) => {
        if (!state.product) return null
        return (where.id && where.id === state.product.id) ||
          (where.sku && where.sku === state.product.sku) ||
          (where.barcode && where.barcode === state.product.barcode)
          ? state.product
          : null
      },
    },
    productBarcode: { findUnique: async () => null },
    prescription: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.rx && state.rx.id === where.id ? state.rx : null,
    },
    customer: {
      findUnique: async () => state.customer,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cust-new', ...data }),
    },
    inventory: {
      findUnique: async () => state.inventory,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: unknown }) => {
        calls.inventoryUpdateMany.push({ where, data })
        if (where.id === state.inventory.id && where.updatedAt === state.inventory.updatedAt) {
          state.inventory.totalQuantity = (data as { totalQuantity: number }).totalQuantity
          state.inventory.availableQuantity = (
            data as { availableQuantity: number }
          ).availableQuantity
          return { count: 1 }
        }
        return { count: 0 }
      },
    },
    batch: {
      findMany: async () => state.batches,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: { soldQuantity?: number; status?: BatchStatusValue }
      }) => {
        calls.batchUpdateMany.push({ where, data })
        const found = state.batches.find(
          (b) =>
            (where.id === undefined || b.id === where.id) &&
            (where.quantity === undefined || b.quantity === where.quantity) &&
            (where.soldQuantity === undefined || b.soldQuantity === where.soldQuantity) &&
            (where.status === undefined || b.status === where.status)
        )
        if (!found) return { count: 0 }
        found.soldQuantity = data.soldQuantity ?? found.soldQuantity
        found.status = data.status ?? found.status
        return { count: 1 }
      },
    },
    batchStatusLog: { create: async () => ({}) },
    sale: {
      create: async ({
        data,
      }: {
        data: {
          invoiceNumber: string
          status: string
          paymentStatus: PaymentStatus
          totalAmount: number | string
          amountPaid: number | string
          balanceDue: number | string
        }
      }) => ({
        id: 'sale-1',
        invoiceNumber: data.invoiceNumber,
        status: data.status,
        paymentStatus: data.paymentStatus,
        totalAmount: data.totalAmount,
        amountPaid: data.amountPaid,
        balanceDue: data.balanceDue,
        customerId: null,
        prescriptionId: null,
        items: [
          {
            id: 'si-1',
            itemBatches: [
              {
                batch: { id: 'batch-1', batchNumber: 'BT-1', expiryDate: new Date('2027-01-01') },
                quantity: 1,
                unitPrice: 100,
              },
            ],
          },
        ],
        payments: [],
      }),
    },
    inventoryMovement: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  }

  return { tx, calls }
}

describe('cashReceived', () => {
  it('sums non-credit payments only', () => {
    expect(
      cashReceived([
        { method: 'CASH', amount: 100 },
        { method: 'UPI', amount: 50.5 },
      ])
    ).toBe(150.5)

    expect(
      cashReceived([
        { method: 'CASH', amount: 100 },
        { method: 'CREDIT', amount: 400 },
      ])
    ).toBe(100)

    expect(cashReceived([{ method: 'CREDIT', amount: 400 }])).toBe(0)
  })
})

describe('derivePaymentStatus', () => {
  const cases: [Parameters<typeof derivePaymentStatus>, PaymentStatus][] = [
    [[[{ method: 'CASH', amount: 100 }], 100], 'PAID'],
    [[[{ method: 'CREDIT', amount: 100 }], 100], 'CREDIT'],
    [[[{ method: 'CASH', amount: 90 }], 100], 'PARTIAL'],
    [[[{ method: 'CASH', amount: 110 }], 100], 'OVERPAID'],
    [
      [
        [
          { method: 'CASH', amount: 100 },
          { method: 'CREDIT', amount: 50 },
        ],
        150,
      ],
      'CREDIT',
    ],
  ]
  it.each(cases)('payments %o vs total %p', (args, expected) => {
    expect(derivePaymentStatus(args[0], args[1])).toBe(expected)
  })
})

describe('buildInvoiceNumber', () => {
  it('uses branch code and zero-pads to 4 digits', () => {
    expect(buildInvoiceNumber('INV', 'A', 1)).toBe('INV-A-0001')
    expect(buildInvoiceNumber('INV', 'BH', 999)).toBe('INV-BH-0999')
    expect(buildInvoiceNumber('INV', 'A', 12345)).toBe('INV-A-12345')
  })
  it('falls back to BR when the branch has no code', () => {
    expect(buildInvoiceNumber('INV', null, 7)).toBe('INV-BR-0007')
    expect(buildInvoiceNumber('INV', '', 7)).toBe('INV-BR-0007')
  })
})

describe('allocateByCreationDate (non-FEFO path)', () => {
  it('allocates from the oldest eligible batch first', () => {
    const result = allocateByCreationDate(
      [
        makeBatch({ id: 'b1', createdAt: new Date('2026-01-01') }),
        makeBatch({ id: 'b2', batchNumber: 'BT-2', createdAt: new Date('2026-06-01') }),
      ],
      6
    )
    expect(result.status).toBe('success')
    expect((result as { allocations: { batchId: string }[] }).allocations).toEqual([
      {
        batchId: 'b1',
        batchNumber: 'BT-1',
        expiryDate: new Date('2027-01-01'),
        allocatedQuantity: 6,
        availableQuantityBefore: 10,
        remainingQuantity: 4,
      },
    ])
  })

  it('never selects expired, blocked or exhausted batches', () => {
    const result = allocateByCreationDate(
      [
        makeBatch({ id: 'b1', status: 'BLOCKED' }),
        makeBatch({ id: 'b2', status: 'EXHAUSTED', soldQuantity: 10 }),
        makeBatch({ id: 'b3', status: 'ACTIVE', expiryDate: new Date('2026-01-01') }),
      ],
      2
    )
    expect(result.status).toBe('no_stock')
  })

  it('reports shortfall when eligible stock is insufficient', () => {
    const result = allocateByCreationDate([makeBatch()], 12)
    expect(result.status).toBe('insufficient')
    if (result.status === 'insufficient') {
      expect(result.shortfall).toBe(2)
      expect(result.allocatedQuantity).toBe(10)
    }
  })

  it('throws on non-positive or fractional quantities', () => {
    expect(() => allocateByCreationDate([makeBatch()], 0)).toThrow('positive integer')
    expect(() => allocateByCreationDate([makeBatch()], 2.5)).toThrow('positive integer')
  })
})

describe('createSale policy gates (no transaction runs)', () => {
  let state: ReturnType<typeof makeState>
  let fake: ReturnType<typeof makeFakeTx>

  beforeEach(() => {
    jest.clearAllMocks()
    mockedSettings.mockResolvedValue(DEFAULT_SETTINGS)
    mockedBranchAccess.mockResolvedValue(undefined)
    state = makeState()
    fake = makeFakeTx(state)
    mockedPrisma.$transaction.mockReturnValue(undefined)
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: TxShape) => unknown) =>
      fn(fake.tx)
    )
  })

  it('rejects a discount without sales:discount', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1, discountPercent: 10 }],
          payments: [{ method: 'CASH', amount: 100 }],
        },
        { id: 'user-1', branchId: 'branch-A', permissions: ['sales:create'] }
      )
    ).rejects.toThrow('requires permission sales:discount')
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a discount above the cap without the override permission', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1, discountPercent: 25 }],
          payments: [{ method: 'CASH', amount: 100 }],
        },
        actor
      )
    ).rejects.toThrow('exceeds the maximum allowed 20%')
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('allows an above-cap discount only with sales:discount_override', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1, discountPercent: 25 }],
          payments: [{ method: 'CASH', amount: 84 }],
        },
        { ...actor, permissions: [...actor.permissions!, 'sales:discount_override'] }
      )
    ).resolves.toMatchObject({ paymentStatus: 'PAID' })
  })

  it('rejects credit sales without sales:credit', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 112 }],
        },
        { id: 'user-1', branchId: 'branch-A', permissions: ['sales:create'] }
      )
    ).rejects.toThrow('requires permission sales:credit')
  })

  it('rejects credit when disabled by the allow_credit_sales setting', async () => {
    mockedSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, allowCreditSales: false })
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 112 }],
          customer: { name: 'R' },
        },
        actor
      )
    ).rejects.toThrow('Credit sales are disabled')
  })

  it('requires a customer for credit sales when configured', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CREDIT', amount: 112 }],
        },
        actor
      )
    ).rejects.toThrow('A customer is required for credit sales')
  })

  it('rejects inline customer capture on a cash sale', async () => {
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
          customer: { name: 'R' },
        },
        actor
      )
    ).rejects.toThrow('Customer capture is only supported for credit sales')
  })

  it('rejects unknown products before any mutation', async () => {
    state.product = null as never
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
        },
        actor
      )
    ).rejects.toThrow('Not Found: product')
  })

  it('enforces the prescription gate (inside the transaction)', async () => {
    state.product = makeProduct({ isPrescriptionRequired: true, drugSchedule: 'H' })
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
        },
        actor
      )
    ).rejects.toThrow('Prescription required for Paracetamol 500mg')
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe('createSale happy path (fake transaction)', () => {
  let state: ReturnType<typeof makeState>
  let fake: ReturnType<typeof makeFakeTx>

  beforeEach(() => {
    jest.clearAllMocks()
    mockedSettings.mockResolvedValue(DEFAULT_SETTINGS)
    mockedBranchAccess.mockResolvedValue(undefined)
    state = makeState()
    fake = makeFakeTx(state)
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: TxShape) => unknown) =>
      fn(fake.tx)
    )
  })

  it('builds the invoice number, deducts batches with CAS, and derives PAID', async () => {
    const sale = await createSale(
      {
        branchId: 'branch-A',
        items: [{ productId: 'prod-1', quantity: 1, discountPercent: 15 }],
        payments: [{ method: 'CASH', amount: 95 }],
      },
      actor
    )

    expect(sale.invoiceNumber).toBe('INV-A-0001')
    expect(sale.paymentStatus).toBe('PAID')

    expect(fake.calls.batchUpdateMany[0].data).toEqual({ soldQuantity: 1 })
    expect(fake.calls.batchUpdateMany[0].where).toMatchObject({
      id: 'batch-1',
      soldQuantity: 0,
      quantity: 10,
      status: 'ACTIVE',
    })

    expect(fake.calls.inventoryUpdateMany[0].data).toEqual({
      totalQuantity: 9,
      availableQuantity: 9,
    })
    expect(fake.calls.branchUpdateMany[0].data).toEqual({ invoiceCounter: 2 })
  })

  it('flips an exhausted batch with a status log when it is fully consumed', async () => {
    state.batches = [makeBatch({ quantity: 1 })]
    state.inventory = { ...state.inventory, totalQuantity: 1, availableQuantity: 1 }
    const statusLogSpy = jest.spyOn(fake.tx.batchStatusLog, 'create')

    await createSale(
      {
        branchId: 'branch-A',
        items: [{ productId: 'prod-1', quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      },
      actor
    )

    const exhaustCall = fake.calls.batchUpdateMany[1]
    expect(exhaustCall.data).toEqual({ status: 'EXHAUSTED' })
    expect(exhaustCall.where).toMatchObject({ id: 'batch-1', soldQuantity: 1, status: 'ACTIVE' })
    expect(statusLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchId: 'batch-1',
          fromStatus: 'ACTIVE',
          toStatus: 'EXHAUSTED',
        }),
      })
    )
  })

  it('aborts the transaction when batch CAS loses the race', async () => {
    state.batches = []
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
        },
        actor
      )
    ).rejects.toThrow('Insufficient available stock')
  })

  it('retries a transient serialization failure through the public API', async () => {
    const calls: number[] = []
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: TxShape) => unknown) => {
      calls.push(1)
      if (calls.length === 1) {
        throw { code: 'P2034' }
      }
      return fn(fake.tx)
    })

    const sale = await createSale(
      {
        branchId: 'branch-A',
        items: [{ productId: 'prod-1', quantity: 1 }],
        payments: [{ method: 'CASH', amount: 112 }],
      },
      actor
    )
    expect(sale.invoiceNumber).toBe('INV-A-0001')
    expect(calls.length).toBe(2)
  })

  it('propagates non-retryable errors immediately', async () => {
    mockedPrisma.$transaction.mockImplementation(async () => {
      throw { code: 'P2003' }
    })
    await expect(
      createSale(
        {
          branchId: 'branch-A',
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: 112 }],
        },
        actor
      )
    ).rejects.toStrictEqual({ code: 'P2003' })
  })
})
