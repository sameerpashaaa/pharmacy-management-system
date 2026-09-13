/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { POST } from '@/app/api/batches/[id]/block/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { blockBatch } from '@/lib/batches/batch-service'
import { prisma } from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/batches/batch-service', () => ({
  blockBatch: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedBlockBatch = blockBatch as jest.Mock

const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('POST /api/batches/:id/block', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the block permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:block'")
    )
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Quality issue' }),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 when the reason is missing', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 when the batch cannot be blocked', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedBlockBatch.mockRejectedValueOnce(new Error('Conflict: batch is expired'))
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Quality issue' }),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(409)
  })

  it('returns 404 for a missing batch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedBlockBatch.mockRejectedValueOnce(new Error('Not Found: batch'))
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Quality issue' }),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(404)
  })

  it('blocks the batch and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedBlockBatch.mockResolvedValueOnce({ id: 'batch-1', status: 'BLOCKED' })

    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Quality issue' }),
      }),
      { params: { id: 'batch-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockedBlockBatch).toHaveBeenCalledWith('batch-1', 'Quality issue', {
      id: 'u1',
      branchId: null,
    })
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'BLOCK', entity: 'Batch', entityId: 'batch-1' }),
      })
    )
  })
})
