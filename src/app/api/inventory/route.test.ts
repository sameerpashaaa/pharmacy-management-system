/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/inventory/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getInventory } from '@/lib/inventory/inventory-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

jest.mock('@/lib/inventory/inventory-service', () => ({
  getInventory: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock
const mockedGetInventory = getInventory as jest.Mock

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('GET /api/inventory', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/inventory?page=1&limit=20'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user cannot access the requested branch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedResolveBranchScope.mockRejectedValueOnce(new Error('Forbidden: no access to branch'))
    const res = await GET(makeReq('http://localhost/api/inventory?branchId=br-9'))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error.code).toBe('ERROR')
  })

  it('returns inventory rows with pagination', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedResolveBranchScope.mockResolvedValueOnce('br-1')
    mockedGetInventory.mockResolvedValueOnce({
      data: [{ id: 'inv-1', productId: 'prod-1', stockStatus: 'in_stock' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await GET(makeReq('http://localhost/api/inventory?page=1&limit=20'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data[0].id).toBe('inv-1')
    expect(mockedGetInventory).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1', page: 1, limit: 20 })
    )
  })

  it('returns 400 for invalid query params', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/inventory?limit=0'))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION')
  })

  it('maps service failures to 500', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedResolveBranchScope.mockResolvedValueOnce('br-1')
    mockedGetInventory.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(makeReq('http://localhost/api/inventory'))
    expect(res.status).toBe(500)
  })
})
