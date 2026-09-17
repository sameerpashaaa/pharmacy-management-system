/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { syncMissingGstTransactions } from '@/lib/finance/gst-service'

import { POST } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/gst-service', () => ({
  syncMissingGstTransactions: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedSyncMissingGstTransactions = syncMissingGstTransactions as jest.Mock

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/gst/sync', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires gst manage permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('triggers sync successfully', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedSyncMissingGstTransactions.mockResolvedValueOnce({
      syncedSales: 5,
      syncedPurchases: 2,
      totalSynced: 7,
    })

    const res = await POST(makeReq({ branchId: 'br-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.totalSynced).toBe(7)
  })
})
