/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/expiry/expiring/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { getExpiringBatches } from '@/lib/batches/expiry-service'
import { resolveBranchScope } from '@/lib/inventory/branch-access'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/batches/expiry-service', () => ({
  getExpiringBatches: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetExpiringBatches = getExpiringBatches as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock

function makeReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest
}

describe('GET /api/expiry/expiring', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:read'")
    )
    const res = await GET(makeReq('http://localhost/api/expiry/expiring'))
    expect(res.status).toBe(403)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/expiry/expiring'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid query (bad page)', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/expiry/expiring?page=0'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid severity', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/expiry/expiring?severity=SEVERE'))
    expect(res.status).toBe(400)
  })

  it('returns the expiring list scoped to the resolved branch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedResolveBranchScope.mockResolvedValueOnce('br-1')
    mockedGetExpiringBatches.mockResolvedValueOnce({
      data: [{ id: 'batch-1', batchNumber: 'B-001', severity: 'CRITICAL', daysRemaining: 12 }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })

    const res = await GET(makeReq('http://localhost/api/expiry/expiring?severity=CRITICAL'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockedGetExpiringBatches).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1', severity: 'CRITICAL' })
    )
  })

  it('keeps the default branch scope when the user has no branch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedResolveBranchScope.mockResolvedValueOnce(null)
    mockedGetExpiringBatches.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    })

    const res = await GET(makeReq('http://localhost/api/expiry/expiring'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockedGetExpiringBatches).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: undefined })
    )
  })
})
