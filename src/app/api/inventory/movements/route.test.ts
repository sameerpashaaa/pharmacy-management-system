/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/inventory/movements/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getMovements } from '@/lib/inventory/inventory-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

jest.mock('@/lib/inventory/inventory-service', () => ({
  getMovements: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock
const mockedGetMovements = getMovements as jest.Mock

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('GET /api/inventory/movements', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/inventory/movements'))
    expect(res.status).toBe(401)
  })

  it('returns movement rows with pagination', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedResolveBranchScope.mockResolvedValueOnce(null)
    mockedGetMovements.mockResolvedValueOnce({
      data: [{ id: 'mov-1', type: 'IN', quantity: 10 }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await GET(
      makeReq('http://localhost/api/inventory/movements?type=IN&page=1&limit=20')
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data[0].quantity).toBe(10)
  })

  it('passes type and branch filters plus search', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedResolveBranchScope.mockResolvedValueOnce('br-1')
    mockedGetMovements.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    })
    await GET(makeReq('http://localhost/api/inventory/movements?search=para&type=ADJUSTMENT'))
    expect(mockedGetMovements).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'para', type: 'ADJUSTMENT', branchId: 'br-1' })
    )
  })

  it('returns 400 for invalid query params', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/inventory/movements?type=NOPE'))
    expect(res.status).toBe(400)
  })
})
