/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/finance/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getFinanceSummary } from '@/lib/finance/finance-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/finance-service', () => ({
  getFinanceSummary: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetFinanceSummary = getFinanceSummary as jest.Mock

function makeReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest
}

describe('GET /api/finance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires finance read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))

    const res = await GET(makeReq('http://localhost/api/finance'))

    expect(res.status).toBe(401)
    expect(mockedRequirePermission).toHaveBeenCalledWith(PERMISSIONS.FINANCE_READ)
  })

  it('returns a finance summary', async () => {
    const user = { id: 'u1', branchId: 'br-1' }
    mockedRequirePermission.mockResolvedValueOnce(user)
    mockedGetFinanceSummary.mockResolvedValueOnce({
      sales: 1000,
      purchases: 400,
      customerReceivables: 125,
      supplierPayables: 75,
      cashCollected: 900,
      taxCollected: 120,
      taxPaid: 48,
      netGstPayable: 72,
    })

    const res = await GET(
      makeReq(
        'http://localhost/api/finance?branchId=br-1&from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.000Z'
      )
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.netGstPayable).toBe(72)
    expect(mockedGetFinanceSummary).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1' }),
      user
    )
  })

  it('returns 400 for an invalid date range', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })

    const res = await GET(
      makeReq(
        'http://localhost/api/finance?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'
      )
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION')
  })
})
