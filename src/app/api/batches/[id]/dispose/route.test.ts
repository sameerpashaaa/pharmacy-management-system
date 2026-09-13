/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { POST } from '@/app/api/batches/[id]/dispose/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { disposeBatch } from '@/lib/batches/batch-service'
import { prisma } from '@/lib/db/prisma'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/batches/batch-service', () => ({
  disposeBatch: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedDisposeBatch = disposeBatch as jest.Mock

const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

const disposeBody = JSON.stringify({ quantity: 10, reason: 'EXPIRED' })

describe('POST /api/batches/:id/dispose', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the dispose permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:dispose'")
    )
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 for an invalid body', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: -1, reason: 'EXPIRED' }),
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 when the batch cannot be disposed', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedDisposeBatch.mockRejectedValueOnce(new Error('Conflict: batch is disposed'))
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(409)
  })

  it('returns 400 when quantity exceeds available stock', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedDisposeBatch.mockRejectedValueOnce(
      new Error('Insufficient available quantity: available 5')
    )
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for a missing batch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedDisposeBatch.mockRejectedValueOnce(new Error('Not Found: batch'))
    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    expect(res.status).toBe(404)
  })

  it('records a partial disposal and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedDisposeBatch.mockResolvedValueOnce({
      id: 'batch-1',
      status: 'ACTIVE',
      availableQuantity: 35,
    })

    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe('10 units disposed from batch')
    expect(mockedDisposeBatch).toHaveBeenCalledWith(
      'batch-1',
      { quantity: 10, reason: 'EXPIRED' },
      {
        id: 'u1',
        branchId: null,
      }
    )
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DISPOSE',
          entity: 'Batch',
          entityId: 'batch-1',
          metadata: { quantity: 10, reason: 'EXPIRED' },
        }),
      })
    )
  })

  it('acknowledges a full disposal', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedDisposeBatch.mockResolvedValueOnce({ id: 'batch-1', status: 'DISPOSED' })

    const res = await POST(
      makeReq('http://localhost/api/batches/batch-1/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: disposeBody,
      }),
      { params: { id: 'batch-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe('Batch fully disposed')
  })
})
