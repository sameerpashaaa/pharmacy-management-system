/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/inventory/branches/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { getAccessibleBranches } from '@/lib/inventory/branch-access'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  getAccessibleBranches: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetAccessibleBranches = getAccessibleBranches as jest.Mock

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('GET /api/inventory/branches', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/inventory/branches'))
    expect(res.status).toBe(401)
  })

  it('returns accessible branches for the user', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedGetAccessibleBranches.mockResolvedValueOnce([
      { id: 'br-1', name: 'Branch A', code: 'BR-A' },
    ])
    const res = await GET(makeReq('http://localhost/api/inventory/branches'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockedGetAccessibleBranches).toHaveBeenCalledWith({ id: 'u1', branchId: 'br-1' })
  })
})
