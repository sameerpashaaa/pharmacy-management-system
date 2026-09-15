/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { recordSupplierPayment } from '@/lib/finance/finance-service'

import { POST } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/finance-service', () => ({
  recordSupplierPayment: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedRecordSupplierPayment = recordSupplierPayment as jest.Mock

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/finance/payables/[id]/payments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires supplier payments permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(makeReq({ amount: 1000 }), { params: { id: 'sup-1' } })
    expect(res.status).toBe(401)
  })

  it('records supplier settlement successfully', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedRecordSupplierPayment.mockResolvedValueOnce({
      payment: { id: 'pay-sup-1', amount: 1200 },
      newBalance: 800,
    })

    const res = await POST(
      makeReq({ amount: 1200, paymentMethod: 'NETBANKING', reference: 'REF-BANK-99' }),
      { params: { id: 'sup-1' } }
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.newBalance).toBe(800)
  })

  it('returns 400 for negative amount', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(makeReq({ amount: 0 }), { params: { id: 'sup-1' } })
    expect(res.status).toBe(400)
  })
})
