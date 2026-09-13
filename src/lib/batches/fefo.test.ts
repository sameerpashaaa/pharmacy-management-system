import { expireDueBatches } from '@/lib/batches/batch-service'
import {
  allocateFefo,
  availableQuantityOf,
  compareFefoCandidates,
  filterEligibleBatches,
  type FefoBatchCandidate,
  type FefoEligibleBatch,
} from '@/lib/batches/fefo'
import { selectFefoBatches } from '@/lib/batches/fefo-service'
import prisma from '@/lib/db/prisma'

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    batch: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/batches/batch-service', () => ({
  __esModule: true,
  expireDueBatches: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  batch: {
    findMany: jest.Mock
    create: jest.Mock
    updateMany: jest.Mock
  }
}

const mockedExpireDueBatches = expireDueBatches as jest.Mock

const DAY = 24 * 60 * 60 * 1000
const future = (days = 30): Date => new Date(Date.now() + days * DAY)
const past = (days = 30): Date => new Date(Date.now() - days * DAY)

function row(overrides: Partial<FefoBatchCandidate> = {}): FefoBatchCandidate {
  return {
    id: 'b1',
    batchNumber: 'B-001',
    productId: 'prod-1',
    quantity: 50,
    reservedQuantity: 0,
    soldQuantity: 0,
    status: 'ACTIVE',
    expiryDate: future(),
    branchId: null,
    ...overrides,
  }
}

function candidate(
  batchId: string,
  availableQuantity: number,
  expiryDate: Date,
  overrides: Partial<FefoEligibleBatch> = {}
): FefoEligibleBatch {
  return {
    batchId,
    batchNumber: `B-${batchId}`,
    productId: 'prod-1',
    expiryDate,
    availableQuantity,
    branchId: null,
    ...overrides,
  }
}

describe('fefo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedExpireDueBatches.mockResolvedValue(0)
  })

  describe('availableQuantityOf', () => {
    it('computes available as quantity minus reserved and sold', () => {
      expect(
        availableQuantityOf(row({ quantity: 100, reservedQuantity: 10, soldQuantity: 5 }))
      ).toBe(85)
    })
  })

  describe('filterEligibleBatches (FEFO eligibility rule)', () => {
    it('keeps only ACTIVE batches with positive availability and future expiry', () => {
      const eligible = [row({ id: 'b-ok', batchNumber: 'B-ok', quantity: 10 })]
      const result = filterEligibleBatches(eligible)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ batchId: 'b-ok', availableQuantity: 10 })
    })

    it('excludes BLOCKED (quarantined) batches even with quantity', () => {
      const result = filterEligibleBatches([row({ id: 'b-q', status: 'BLOCKED' })])
      expect(result).toHaveLength(0)
    })

    it('excludes EXPIRED batches even with quantity', () => {
      const result = filterEligibleBatches([row({ id: 'b-x', status: 'EXPIRED' })])
      expect(result).toHaveLength(0)
    })

    it('excludes DISPOSED batches', () => {
      const result = filterEligibleBatches([row({ id: 'b-d', status: 'DISPOSED' })])
      expect(result).toHaveLength(0)
    })

    it('excludes EXHAUSTED batches', () => {
      const result = filterEligibleBatches([row({ id: 'b-e', status: 'EXHAUSTED' })])
      expect(result).toHaveLength(0)
    })

    it('excludes ACTIVE batches with zero available quantity', () => {
      const result = filterEligibleBatches([
        row({ id: 'b-z', quantity: 10, reservedQuantity: 10, soldQuantity: 0 }),
      ])
      expect(result).toHaveLength(0)
    })

    it('excludes ACTIVE batches with negative available quantity', () => {
      const result = filterEligibleBatches([
        row({ id: 'b-n', quantity: 5, reservedQuantity: 10, soldQuantity: 0 }),
      ])
      expect(result).toHaveLength(0)
    })

    it('excludes ACTIVE batches whose expiry date has passed', () => {
      const result = filterEligibleBatches([row({ id: 'b-p', expiryDate: past() })])
      expect(result).toHaveLength(0)
    })

    it('is length-sensitive: one valid batch among several ineligible ones stays', () => {
      const result = filterEligibleBatches([
        row({ id: 'b-1', status: 'BLOCKED' }),
        row({ id: 'b-2', status: 'EXPIRED' }),
        row({ id: 'b-3', status: 'ACTIVE', quantity: 8, expiryDate: future() }),
        row({ id: 'b-4', status: 'ACTIVE', quantity: 0 }),
      ])
      expect(result).toHaveLength(1)
      expect(result[0].batchId).toBe('b-3')
    })
  })

  describe('allocateFefo (pure allocation)', () => {
    it('allocates a single eligible batch in full', () => {
      const result = allocateFefo([candidate('b1', 40, future(10))], 40)
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocatedQuantity).toBe(40)
      expect(result.allocations).toEqual([
        expect.objectContaining({
          batchId: 'b1',
          allocatedQuantity: 40,
          availableQuantityBefore: 40,
          remainingQuantity: 0,
        }),
      ])
    })

    it('orders multiple batches by earliest expiry first', () => {
      const result = allocateFefo(
        [
          candidate('latest', 10, future(90)),
          candidate('earliest', 10, future(10)),
          candidate('middle', 10, future(45)),
        ],
        30
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => a.batchId)).toEqual(['earliest', 'middle', 'latest'])
    })

    it('spans multiple batches with different quantities (40/35/50 → 25)', () => {
      const result = allocateFefo(
        [
          candidate('a', 40, future(10)),
          candidate('b', 35, future(20)),
          candidate('c', 50, future(30)),
        ],
        100
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => a.batchId)).toEqual(['a', 'b', 'c'])
      expect(result.allocations.map((a) => a.allocatedQuantity)).toEqual([40, 35, 25])
      expect(result.allocatedQuantity).toBe(100)
    })

    it('fulfills the request from the first batch only when it has enough', () => {
      const result = allocateFefo(
        [candidate('early', 40, future(10)), candidate('late', 40, future(60))],
        25
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations).toHaveLength(1)
      expect(result.allocations[0]).toMatchObject({
        batchId: 'early',
        allocatedQuantity: 25,
        remainingQuantity: 15,
      })
    })

    it('handles a request spanning several batches', () => {
      const result = allocateFefo(
        [
          candidate('a', 10, future(5)),
          candidate('b', 20, future(6)),
          candidate('c', 30, future(7)),
        ],
        45
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => a.allocatedQuantity)).toEqual([10, 20, 15])
      expect(result.allocations[0].remainingQuantity).toBe(0)
      expect(result.allocations[1].remainingQuantity).toBe(0)
      expect(result.allocations[2].remainingQuantity).toBe(15)
    })

    it('succeeds when the request exactly equals total eligible stock', () => {
      const result = allocateFefo(
        [candidate('a', 25, future(5)), candidate('b', 25, future(6))],
        50
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocatedQuantity).toBe(50)
      expect(result.allocations.every((a) => a.remainingQuantity === 0)).toBe(true)
    })

    it('returns a structured insufficient result when eligible stock is too small', () => {
      const result = allocateFefo(
        [candidate('a', 20, future(5)), candidate('b', 15, future(6))],
        100
      )
      expect(result.status).toBe('insufficient')
      if (result.status !== 'insufficient') return
      expect(result.allocatedQuantity).toBe(35)
      expect(result.shortfall).toBe(65)
      expect(result.allocations.map((a) => a.allocatedQuantity)).toEqual([20, 15])
    })

    it('returns no_stock when there are no candidates', () => {
      const result = allocateFefo([], 10)
      expect(result).toEqual({
        status: 'no_stock',
        requestedQuantity: 10,
        allocatedQuantity: 0,
        shortfall: 10,
        allocations: [],
      })
    })

    it('returns no_stock when every candidate has zero availability', () => {
      const result = allocateFefo([candidate('a', 0, future(5)), candidate('b', 0, future(6))], 10)
      expect(result.status).toBe('no_stock')
    })

    it('rejects a zero requested quantity', () => {
      expect(() => allocateFefo([candidate('a', 10, future(5))], 0)).toThrow(
        'Requested quantity must be a positive integer'
      )
    })

    it('rejects a negative requested quantity', () => {
      expect(() => allocateFefo([candidate('a', 10, future(5))], -3)).toThrow(
        'Requested quantity must be a positive integer'
      )
    })

    it('rejects a non-integer requested quantity', () => {
      expect(() => allocateFefo([candidate('a', 10, future(5))], 2.5)).toThrow(
        'Requested quantity must be a positive integer'
      )
    })

    it('breaks equal expiry dates deterministically by batch id', () => {
      const sameExpiry = future(10)
      const result = allocateFefo(
        [
          candidate('b-batch9', 10, sameExpiry),
          candidate('b-batch1', 10, sameExpiry),
          candidate('b-batch5', 10, sameExpiry),
        ],
        30
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => a.batchId)).toEqual(['b-batch1', 'b-batch5', 'b-batch9'])
    })

    it('is independent of input order for equal expiry dates', () => {
      const sameExpiry = future(10)
      const shuffled = [candidate('z', 10, sameExpiry), candidate('a', 10, sameExpiry)]
      const result = allocateFefo(shuffled, 20)
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => a.batchId)).toEqual(['a', 'z'])
    })

    it('allocatedQuantity equals the sum of allocation slices', () => {
      const result = allocateFefo(
        [
          candidate('a', 33, future(5)),
          candidate('b', 33, future(6)),
          candidate('c', 34, future(7)),
        ],
        80
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      const sum = result.allocations.reduce((acc, a) => acc + a.allocatedQuantity, 0)
      expect(sum).toBe(80)
      expect(result.allocatedQuantity).toBe(80)
    })

    it('reports correct remaining quantities', () => {
      const result = allocateFefo(
        [candidate('a', 20, future(5)), candidate('b', 20, future(6))],
        30
      )
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations[0].remainingQuantity).toBe(0)
      expect(result.allocations[1].remainingQuantity).toBe(10)
    })
  })

  describe('compareFefoCandidates', () => {
    it('orders by expiry date then batch id', () => {
      const a = candidate('a', 1, future(30))
      const b = candidate('b', 1, future(10))
      expect(compareFefoCandidates(a, b)).toBeGreaterThan(0)
      expect(compareFefoCandidates(b, a)).toBeLessThan(0)
    })
  })

  describe('selectFefoBatches (service)', () => {
    const rows = [
      { ...row({ id: 'b1', batchNumber: 'B-001', quantity: 40, expiryDate: future(10) }) },
      { ...row({ id: 'b2', batchNumber: 'B-002', quantity: 35, expiryDate: future(20) }) },
      { ...row({ id: 'b3', batchNumber: 'B-003', quantity: 50, expiryDate: future(30) }) },
    ]

    it('runs the expiry sweep before selecting', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      await selectFefoBatches('prod-1', 5)
      expect(mockedExpireDueBatches).toHaveBeenCalledTimes(1)
    })

    it('queries only the requested product (isolation) and ACTIVE unexpired batches', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      await selectFefoBatches('prod-1', 5)
      expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: 'prod-1',
            status: 'ACTIVE',
            expiryDate: { gte: expect.any(Date) },
          }),
        })
      )
    })

    it('does not include a branchId filter when none requested', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      await selectFefoBatches('prod-1', 5)
      const args = prismaMock.batch.findMany.mock.calls[0][0]
      expect(args.where.branchId).toBeUndefined()
    })

    it('restricts selection to the requested branch', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      await selectFefoBatches('prod-1', 5, { branchId: 'branch-1' })
      const args = prismaMock.batch.findMany.mock.calls[0][0]
      expect(args.where.branchId).toBe('branch-1')
    })

    it('allocates across batches exactly like the pure algorithm', async () => {
      prismaMock.batch.findMany.mockResolvedValue(rows)
      const result = await selectFefoBatches('prod-1', 100)
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      expect(result.allocations.map((a) => ({ id: a.batchId, qty: a.allocatedQuantity }))).toEqual([
        { id: 'b1', qty: 40 },
        { id: 'b2', qty: 35 },
        { id: 'b3', qty: 25 },
      ])
    })

    it('still excludes ineligible rows even if they leak through the query', async () => {
      prismaMock.batch.findMany.mockResolvedValue([
        row({ id: 'b-blocked', status: 'BLOCKED', quantity: 999, expiryDate: future(1) }),
        row({ id: 'b-expired', status: 'EXPIRED', quantity: 999, expiryDate: future(1) }),
        row({
          id: 'b-zero',
          status: 'ACTIVE',
          quantity: 10,
          reservedQuantity: 10,
          expiryDate: future(1),
        }),
      ])
      const result = await selectFefoBatches('prod-1', 10)
      expect(result.status).toBe('no_stock')
    })

    it('returns insufficient with shortfall through the service', async () => {
      prismaMock.batch.findMany.mockResolvedValue([
        row({ id: 'b1', quantity: 8, expiryDate: future(10) }),
        row({ id: 'b2', quantity: 5, expiryDate: future(20) }),
      ])
      const result = await selectFefoBatches('prod-1', 20)
      expect(result.status).toBe('insufficient')
      if (result.status !== 'insufficient') return
      expect(result.allocatedQuantity).toBe(13)
      expect(result.shortfall).toBe(7)
    })

    it('returns no_stock when the query returns nothing', async () => {
      prismaMock.batch.findMany.mockResolvedValue([])
      const result = await selectFefoBatches('prod-1', 10)
      expect(result.status).toBe('no_stock')
    })

    it('only reads — it never mutates batches', async () => {
      prismaMock.batch.findMany.mockResolvedValue(rows)
      await selectFefoBatches('prod-1', 5)
      expect(prismaMock.batch.create).not.toHaveBeenCalled()
      expect(prismaMock.batch.updateMany).not.toHaveBeenCalled()
    })

    it('rejects a missing product identifier without querying the DB', async () => {
      await expect(selectFefoBatches('', 5)).rejects.toThrow('Product identifier is required')
      await expect(selectFefoBatches('   ', 5)).rejects.toThrow('Product identifier is required')
      expect(prismaMock.batch.findMany).not.toHaveBeenCalled()
    })

    it('rejects zero or negative quantities without querying the DB', async () => {
      await expect(selectFefoBatches('prod-1', 0)).rejects.toThrow(
        'Requested quantity must be a positive integer'
      )
      await expect(selectFefoBatches('prod-1', -4)).rejects.toThrow(
        'Requested quantity must be a positive integer'
      )
      await expect(selectFefoBatches('prod-1', 1.5)).rejects.toThrow(
        'Requested quantity must be a positive integer'
      )
      expect(prismaMock.batch.findMany).not.toHaveBeenCalled()
    })
  })
})
