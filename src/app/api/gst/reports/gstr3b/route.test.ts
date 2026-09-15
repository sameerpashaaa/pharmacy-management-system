/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getGstr3bReport } from '@/lib/finance/gst-service'

import { GET } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/gst-service', () => ({
  getGstr3bReport: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetGstr3bReport = getGstr3bReport as jest.Mock

function makeReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest
}

describe('GET /api/gst/reports/gstr3b', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires gst read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/gst/reports/gstr3b'))
    expect(res.status).toBe(401)
  })

  it('returns GSTR-3B structured report', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetGstr3bReport.mockResolvedValueOnce({
      returnPeriod: '09-2026',
      table31OutwardSupplies: { totalTax: 1200 },
      table4EligibleItc: { totalTax: 500 },
      table6PaymentOfTax: { netTotalPayable: 700 },
    })

    const res = await GET(makeReq('http://localhost/api/gst/reports/gstr3b?returnPeriod=09-2026'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.table6PaymentOfTax.netTotalPayable).toBe(700)
  })
})
