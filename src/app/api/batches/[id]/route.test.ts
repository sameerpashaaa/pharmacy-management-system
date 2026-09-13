/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET, PATCH } from '@/app/api/batches/[id]/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { getBatchById, updateBatch } from '@/lib/batches/batch-service'
import { prisma } from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/batches/batch-service', () => ({
  getBatchById: jest.fn(),
  updateBatch: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetBatchById = getBatchById as jest.Mock
const mockedUpdateBatch = updateBatch as jest.Mock

const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

const batchFixture = {
  id: 'batch-1',
  batchNumber: 'B-001',
  status: 'ACTIVE',
  availableQuantity: 45,
}

describe('GET /api/batches/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:read'")
    )
    const res = await GET(makeReq('http://localhost/api/batches/batch-1'), {
      params: { id: 'batch-1' },
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for a missing batch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedGetBatchById.mockResolvedValueOnce(null)
    const res = await GET(makeReq('http://localhost/api/batches/batch-1'), {
      params: { id: 'batch-1' },
    })
    expect(res.status).toBe(404)
  })

  it('returns the batch detail', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedGetBatchById.mockResolvedValueOnce(batchFixture)
    const res = await GET(makeReq('http://localhost/api/batches/batch-1'), {
      params: { id: 'batch-1' },
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toEqual(batchFixture)
  })
})

describe('PATCH /api/batches/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the update permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:update'")
    )
    const res = await PATCH(makeReq('http://localhost/api/batches/batch-1'), {
      params: { id: 'batch-1' },
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for a missing batch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedGetBatchById.mockResolvedValueOnce(null)
    const res = await PATCH(
      makeReq('http://localhost/api/batches/batch-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrp: 20 }),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid or empty body', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedGetBatchById.mockResolvedValueOnce(batchFixture)
    const res = await PATCH(
      makeReq('http://localhost/api/batches/batch-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(400)
  })

  it('updates the batch and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedGetBatchById.mockResolvedValueOnce(batchFixture)
    mockedUpdateBatch.mockResolvedValueOnce({ ...batchFixture, mrp: 20 })

    const res = await PATCH(
      makeReq('http://localhost/api/batches/batch-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrp: 20 }),
      }),
      { params: { id: 'batch-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockedUpdateBatch).toHaveBeenCalledWith(
      'batch-1',
      { mrp: 20 },
      { id: 'u1', branchId: null }
    )
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'UPDATE', entity: 'Batch', entityId: 'batch-1' }),
      })
    )
  })
})
