/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { fileGstReturnPeriod } from '@/lib/finance/gst-service'

import { POST } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/gst-service', () => ({
  fileGstReturnPeriod: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedFileGstReturnPeriod = fileGstReturnPeriod as jest.Mock

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/gst/file', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires gst manage permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(makeReq({ returnPeriod: '09-2026' }))
    expect(res.status).toBe(401)
  })

  it('files return period successfully', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedFileGstReturnPeriod.mockResolvedValueOnce({
      returnPeriod: '09-2026',
      updatedCount: 20,
    })

    const res = await POST(makeReq({ returnPeriod: '09-2026' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.updatedCount).toBe(20)
  })

  it('returns 400 for invalid period format', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(makeReq({ returnPeriod: '2026-09' }))
    expect(res.status).toBe(400)
  })
})
