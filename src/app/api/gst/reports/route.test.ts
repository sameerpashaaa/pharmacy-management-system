/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET } from '@/app/api/gst/reports/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getGstSummary } from '@/lib/finance/finance-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/finance-service', () => ({
  getGstSummary: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetGstSummary = getGstSummary as jest.Mock

function makeReq(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest
}

describe('GET /api/gst/reports', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires GST read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Forbidden: requires permission'))

    const res = await GET(makeReq('http://localhost/api/gst/reports'))

    expect(res.status).toBe(403)
    expect(mockedRequirePermission).toHaveBeenCalledWith(PERMISSIONS.GST_READ)
  })

  it('returns GST totals and grouped summaries', async () => {
    const user = { id: 'u1', branchId: 'br-1' }
    mockedRequirePermission.mockResolvedValueOnce(user)
    mockedGetGstSummary.mockResolvedValueOnce({
      taxableAmount: 1000,
      cgstAmount: 60,
      sgstAmount: 60,
      igstAmount: 0,
      totalTax: 120,
      totalAmount: 1120,
      transactionCount: 2,
      byType: [
        { type: 'B2C', taxableAmount: 1000, totalTax: 120, totalAmount: 1120, transactionCount: 2 },
      ],
      byHsn: [
        {
          hsnCode: '3004',
          taxableAmount: 1000,
          totalTax: 120,
          totalAmount: 1120,
          transactionCount: 2,
        },
      ],
    })

    const res = await GET(makeReq('http://localhost/api/gst/reports?returnPeriod=09-2026&type=B2C'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.transactionCount).toBe(2)
    expect(mockedGetGstSummary).toHaveBeenCalledWith(
      expect.objectContaining({ returnPeriod: '09-2026', type: 'B2C' }),
      user
    )
  })

  it('returns 400 for invalid return periods', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })

    const res = await GET(makeReq('http://localhost/api/gst/reports?returnPeriod=2026-09'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION')
  })
})
