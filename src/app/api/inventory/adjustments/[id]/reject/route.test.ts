/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { POST } from '@/app/api/inventory/adjustments/[id]/reject/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { rejectAdjustment } from '@/lib/inventory/inventory-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/inventory-service', () => ({
  rejectAdjustment: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedRejectAdjustment = rejectAdjustment as jest.Mock

const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('POST /api/inventory/adjustments/:id/reject', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the approve permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'inventory:approve_adjustment'")
    )
    const res = await POST(makeReq('http://localhost/api/inventory/adjustments/adj-1/reject'), {
      params: { id: 'adj-1' },
    })
    expect(res.status).toBe(403)
  })

  it('rejects the adjustment and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedRejectAdjustment.mockResolvedValueOnce({ id: 'adj-1', status: 'REJECTED' })
    const res = await POST(makeReq('http://localhost/api/inventory/adjustments/adj-1/reject'), {
      params: { id: 'adj-1' },
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.message).toBe('Adjustment rejected')
    expect(mockedRejectAdjustment).toHaveBeenCalledWith('adj-1', { id: 'u1', branchId: 'br-1' })
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REJECT', entityId: 'adj-1' }),
      })
    )
  })

  it('returns 409 when the adjustment is not pending', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedRejectAdjustment.mockRejectedValueOnce(
      new Error('Conflict: adjustment is approved, not pending')
    )
    const res = await POST(makeReq('http://localhost/api/inventory/adjustments/adj-1/reject'), {
      params: { id: 'adj-1' },
    })
    expect(res.status).toBe(409)
  })

  it('returns 404 for a missing adjustment', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedRejectAdjustment.mockRejectedValueOnce(new Error('Not Found: adjustment'))
    const res = await POST(makeReq('http://localhost/api/inventory/adjustments/adj-1/reject'), {
      params: { id: 'adj-1' },
    })
    expect(res.status).toBe(404)
  })
})
