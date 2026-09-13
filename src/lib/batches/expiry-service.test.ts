import type { Batch, Product } from '@prisma/client'

import { expireDueBatches } from '@/lib/batches/batch-service'
import {
  daysUntilExpiryDate,
  EXPIRY_CRITICAL_DAYS,
  EXPIRY_WARNING_DAYS,
  EXPIRY_INFO_DAYS,
  expirySeverity,
  getExpiredBatches,
  getExpiringBatches,
  getExpirySummary,
} from '@/lib/batches/expiry-service'
import prisma from '@/lib/db/prisma'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    batch: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/batches/batch-service', () => ({
  expireDueBatches: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  batch: { findMany: jest.Mock; count: jest.Mock }
}
const mockedExpireDueBatches = expireDueBatches as jest.Mock

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-01-15T12:00:00.000Z')

interface DecimalLike {
  toString: () => string
}

interface BatchFields {
  id: string
  productId: string
  branchId: string | null
  batchNumber: string
  manufacturingDate: Date | null
  expiryDate: Date
  quantity: number
  reservedQuantity: number
  soldQuantity: number
  purchasePrice: DecimalLike
  mrp: DecimalLike
  status: 'ACTIVE' | 'BLOCKED' | 'EXHAUSTED' | 'EXPIRED' | 'DISPOSED'
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}

function makeBatch(overrides: Partial<BatchFields>): Batch {
  const base: BatchFields = {
    id: 'batch-1',
    productId: 'prod-1',
    branchId: 'br-1',
    batchNumber: 'B-001',
    manufacturingDate: null,
    expiryDate: new Date(NOW.getTime() + 45 * DAY),
    quantity: 100,
    reservedQuantity: 0,
    soldQuantity: 0,
    purchasePrice: { toString: () => '50.00' },
    mrp: { toString: () => '80.00' },
    status: 'ACTIVE',
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
  return { ...base, ...overrides } as unknown as Batch
}

function makeProduct(id: string = 'prod-1'): Product {
  return { id, name: 'Paracetamol 500mg', sku: 'PARA-500' } as unknown as Product
}

function makeRow(batch: Batch) {
  return { ...batch, product: makeProduct(batch.productId) }
}

function expiryPlus(days: number): Date {
  return new Date(NOW.getTime() + days * DAY)
}

describe('daysUntilExpiryDate', () => {
  it('returns whole days rounded up (ceil) against a fixed now', () => {
    expect(daysUntilExpiryDate(expiryPlus(90), NOW)).toBe(90)
    expect(daysUntilExpiryDate(expiryPlus(60), NOW)).toBe(60)
    expect(daysUntilExpiryDate(expiryPlus(1), NOW)).toBe(1)
    expect(daysUntilExpiryDate(new Date(NOW.getTime() + 0.5 * DAY), NOW)).toBe(1)
    expect(daysUntilExpiryDate(expiryPlus(0), NOW)).toBe(0)
    expect(daysUntilExpiryDate(expiryPlus(-2), NOW)).toBe(-2)
  })
})

describe('expirySeverity', () => {
  it('classifies exactly 30 days as CRITICAL (inclusive)', () => {
    expect(expirySeverity(expiryPlus(EXPIRY_CRITICAL_DAYS), NOW)).toBe('CRITICAL')
    expect(expirySeverity(expiryPlus(29), NOW)).toBe('CRITICAL')
    expect(expirySeverity(expiryPlus(1), NOW)).toBe('CRITICAL')
  })

  it('classifies days 31..60 as WARNING (inclusive of 60)', () => {
    expect(expirySeverity(expiryPlus(31), NOW)).toBe('WARNING')
    expect(expirySeverity(expiryPlus(45), NOW)).toBe('WARNING')
    expect(expirySeverity(expiryPlus(EXPIRY_WARNING_DAYS), NOW)).toBe('WARNING')
  })

  it('classifies days 61..90 as INFO (inclusive of 90)', () => {
    expect(expirySeverity(expiryPlus(61), NOW)).toBe('INFO')
    expect(expirySeverity(expiryPlus(EXPIRY_INFO_DAYS), NOW)).toBe('INFO')
  })

  it('returns null beyond the 90-day window', () => {
    expect(expirySeverity(expiryPlus(91), NOW)).toBeNull()
    expect(expirySeverity(expiryPlus(365), NOW)).toBeNull()
  })

  it('returns null for already-expired batches (<= 0 days)', () => {
    expect(expirySeverity(expiryPlus(0), NOW)).toBeNull()
    expect(expirySeverity(expiryPlus(-1), NOW)).toBeNull()
    expect(expirySeverity(expiryPlus(-30), NOW)).toBeNull()
  })
})

describe('getExpiringBatches', () => {
  beforeEach(() => jest.clearAllMocks())

  it('runs the lazy expiry sweep before reading', async () => {
    mockedExpireDueBatches.mockResolvedValueOnce(1)
    prismaMock.batch.findMany.mockResolvedValueOnce([])

    await getExpiringBatches({}, NOW)

    expect(mockedExpireDueBatches).toHaveBeenCalledTimes(1)
  })

  it('queries ACTIVE batches whose expiry is within (now, now + 90 days]', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([])

    await getExpiringBatches({ page: 1, limit: 20, branchId: 'br-1' }, NOW)

    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          expiryDate: { gt: NOW, lte: new Date(NOW.getTime() + EXPIRY_INFO_DAYS * DAY) },
          branchId: 'br-1',
        }),
        orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      })
    )
  })

  it('excludes zero-availability batches from the expiring view', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(makeBatch({ id: 'b-zero', batchNumber: 'B-ZERO', quantity: 10, soldQuantity: 10 })),
      makeRow(makeBatch({ id: 'b-avail', batchNumber: 'B-AVAIL', quantity: 10, soldQuantity: 2 })),
    ])

    const result = await getExpiringBatches({}, NOW)

    expect(result.data.map((b) => b.batchNumber)).toEqual(['B-AVAIL'])
  })

  it('applies the severity filter for CRITICAL batches', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(makeBatch({ id: 'b-crit', batchNumber: 'B-CRIT', expiryDate: expiryPlus(20) })),
      makeRow(makeBatch({ id: 'b-warn', batchNumber: 'B-WARN', expiryDate: expiryPlus(45) })),
    ])

    const result = await getExpiringBatches({ severity: 'CRITICAL' }, NOW)

    expect(result.data.map((b) => b.batchNumber)).toEqual(['B-CRIT'])
  })

  it('applies the severity filter for INFO batches', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(makeBatch({ id: 'b-warn', batchNumber: 'B-WARN', expiryDate: expiryPlus(45) })),
      makeRow(makeBatch({ id: 'b-info', batchNumber: 'B-INFO', expiryDate: expiryPlus(85) })),
    ])

    const result = await getExpiringBatches({ severity: 'INFO' }, NOW)

    expect(result.data.map((b) => b.batchNumber)).toEqual(['B-INFO'])
  })

  it('preserves the earliest-expiry-first order returned by the query (ties by id)', async () => {
    // Prisma applies orderBy [{expiryDate:'asc'},{id:'asc'}] (asserted in the
    // "queries ACTIVE batches" test); the service must preserve it stably.
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(makeBatch({ id: 'b', batchNumber: 'B-B', expiryDate: expiryPlus(10) })),
      makeRow(makeBatch({ id: 'c', batchNumber: 'B-C', expiryDate: expiryPlus(10) })),
      makeRow(makeBatch({ id: 'a', batchNumber: 'B-A', expiryDate: expiryPlus(50) })),
    ])

    const result = await getExpiringBatches({}, NOW)

    expect(result.data.map((b) => b.batchNumber)).toEqual(['B-B', 'B-C', 'B-A'])
  })

  it('reports availableQuantity and computed days/severity per row', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(
        makeBatch({
          quantity: 50,
          reservedQuantity: 5,
          soldQuantity: 15,
          expiryDate: expiryPlus(30),
        })
      ),
    ])

    const result = await getExpiringBatches({}, NOW)

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        availableQuantity: 30,
        daysRemaining: 30,
        severity: 'CRITICAL',
        batchNumber: 'B-001',
      })
    )
  })

  it('filters by product, search, branch and paginates server-side', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRow(
        makeBatch({
          id: `b-${i}`,
          batchNumber: `B-${String(i).padStart(3, '0')}`,
          expiryDate: expiryPlus(15 + i),
        })
      )
    )
    prismaMock.batch.findMany.mockResolvedValueOnce(rows)

    const result = await getExpiringBatches(
      { page: 2, limit: 20, productId: 'prod-x', branchId: 'br-2', search: 'para' },
      NOW
    )

    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'prod-x',
          branchId: 'br-2',
          OR: expect.arrayContaining([
            expect.objectContaining({ batchNumber: { contains: 'para', mode: 'insensitive' } }),
          ]),
        }),
      })
    )
    expect(result.data).toHaveLength(5)
    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 25, pages: 2 })
  })

  it('is deterministic when all batches share the same expiry', async () => {
    // Prisma resolves the id tie-break ({id:'asc'}); the service preserves it.
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(makeBatch({ id: 'a', batchNumber: 'B-A', expiryDate: expiryPlus(60) })),
      makeRow(makeBatch({ id: 'z', batchNumber: 'B-Z', expiryDate: expiryPlus(60) })),
    ])

    const result = await getExpiringBatches({}, NOW)

    expect(result.data.map((b) => b.id)).toEqual(['a', 'z'])
  })
})

describe('getExpiredBatches', () => {
  beforeEach(() => jest.clearAllMocks())

  it('runs the lazy expiry sweep and queries EXPIRED status only', async () => {
    mockedExpireDueBatches.mockResolvedValueOnce(2)
    prismaMock.batch.findMany.mockResolvedValueOnce([])
    prismaMock.batch.count.mockResolvedValueOnce(0)

    await getExpiredBatches({}, NOW)

    expect(mockedExpireDueBatches).toHaveBeenCalledTimes(1)
    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'EXPIRED' }) })
    )
  })

  it('does not include DISPOSED batches (terminal state, not expired stock)', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([])
    prismaMock.batch.count.mockResolvedValueOnce(0)

    await getExpiredBatches({}, NOW)

    expect(prismaMock.batch.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'EXPIRED' }) })
    )
    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ status: 'DISPOSED' }) })
    )
  })

  it('maps rows to availableQuantity and daysPast', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      makeRow(
        makeBatch({
          id: 'expired-1',
          batchNumber: 'B-EXP',
          expiryDate: expiryPlus(-5),
          quantity: 20,
          soldQuantity: 7,
        })
      ),
    ])
    prismaMock.batch.count.mockResolvedValueOnce(1)

    const result = await getExpiredBatches({}, NOW)

    expect(result.data[0]).toEqual(
      expect.objectContaining({ batchNumber: 'B-EXP', availableQuantity: 13, daysPast: 5 })
    )
  })

  it('orders oldest-expired first and paginates', async () => {
    const rows = [
      makeRow(makeBatch({ id: 'old', batchNumber: 'B-OLD', expiryDate: expiryPlus(-30) })),
      makeRow(makeBatch({ id: 'recent', batchNumber: 'B-RECENT', expiryDate: expiryPlus(-2) })),
    ]
    prismaMock.batch.findMany.mockResolvedValueOnce(rows)
    prismaMock.batch.count.mockResolvedValueOnce(2)

    const result = await getExpiredBatches({}, NOW)

    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      })
    )
    expect(result.data.map((b) => b.batchNumber)).toEqual(['B-OLD', 'B-RECENT'])
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, pages: 1 })
  })

  it('scopes to branch and product', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([])
    prismaMock.batch.count.mockResolvedValueOnce(0)

    await getExpiredBatches({ branchId: 'br-9', productId: 'prod-9' }, NOW)

    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'br-9', productId: 'prod-9' }),
      })
    )
  })
})

describe('getExpirySummary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('counts by severity, skipping zero-availability batches', async () => {
    prismaMock.batch.findMany.mockResolvedValueOnce([
      { id: 'c1', expiryDate: expiryPlus(10), quantity: 5, reservedQuantity: 0, soldQuantity: 0 },
      { id: 'c2', expiryDate: expiryPlus(20), quantity: 5, reservedQuantity: 0, soldQuantity: 5 },
      { id: 'w1', expiryDate: expiryPlus(45), quantity: 5, reservedQuantity: 0, soldQuantity: 0 },
      { id: 'i1', expiryDate: expiryPlus(85), quantity: 5, reservedQuantity: 0, soldQuantity: 0 },
      { id: 'out', expiryDate: expiryPlus(100), quantity: 5, reservedQuantity: 0, soldQuantity: 0 },
    ])
    prismaMock.batch.count.mockResolvedValueOnce(3)

    const summary = await getExpirySummary(undefined, NOW)

    expect(summary).toEqual({ critical: 1, warning: 1, info: 1, expiring: 3, expired: 3 })
  })

  it('runs the lazy sweep and scopes to the given branch', async () => {
    mockedExpireDueBatches.mockResolvedValueOnce(1)
    prismaMock.batch.findMany.mockResolvedValueOnce([])
    prismaMock.batch.count.mockResolvedValueOnce(0)

    await getExpirySummary('br-7', NOW)

    expect(mockedExpireDueBatches).toHaveBeenCalledTimes(1)
    expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'br-7' }) })
    )
    expect(prismaMock.batch.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'EXPIRED', branchId: 'br-7' }),
      })
    )
  })
})
