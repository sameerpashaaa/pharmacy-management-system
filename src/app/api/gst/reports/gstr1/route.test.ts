/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getGstr1Report } from '@/lib/finance/gst-service'

import { GET } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/gst-service', () => ({
  getGstr1Report: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetGstr1Report = getGstr1Report as jest.Mock

function makeReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest
}

describe('GET /api/gst/reports/gstr1', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires gst read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/gst/reports/gstr1'))
    expect(res.status).toBe(401)
  })

  it('returns GSTR-1 structured report', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetGstr1Report.mockResolvedValueOnce({
      returnPeriod: '09-2026',
      summary: { transactionCount: 12, totalAmount: 15000 },
      b2b: [],
      b2c: [],
      hsnSummary: [],
    })

    const res = await GET(makeReq('http://localhost/api/gst/reports/gstr1?returnPeriod=09-2026'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.returnPeriod).toBe('09-2026')
  })
})
