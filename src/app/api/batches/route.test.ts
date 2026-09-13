/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/batches/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { getBatches } from '@/lib/batches/batch-service'
import { resolveBranchScope } from '@/lib/inventory/branch-access'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/batches/batch-service', () => ({
  getBatches: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetBatches = getBatches as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock

function makeReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest
}

describe('GET /api/batches', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires the read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'batches:read'")
    )
    const res = await GET(makeReq('http://localhost/api/batches'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for an invalid query', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/batches?page=0'))
    expect(res.status).toBe(400)
  })

  it('returns a paginated batch list scoped to the resolved branch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedResolveBranchScope.mockResolvedValueOnce('br-1')
    mockedGetBatches.mockResolvedValueOnce({
      data: [{ id: 'batch-1', batchNumber: 'B-001', availableQuantity: 45 }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })

    const res = await GET(makeReq('http://localhost/api/batches?status=ACTIVE'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockedGetBatches).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1', status: 'ACTIVE' })
    )
  })
})
