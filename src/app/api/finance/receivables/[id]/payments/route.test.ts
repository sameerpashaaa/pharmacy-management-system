/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { recordCustomerPayment } from '@/lib/finance/finance-service'

import { POST } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/finance-service', () => ({
  recordCustomerPayment: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedRecordCustomerPayment = recordCustomerPayment as jest.Mock

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/finance/receivables/[id]/payments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires customer payments permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(makeReq({ amount: 100 }), { params: { id: 'cust-1' } })
    expect(res.status).toBe(401)
  })

  it('records customer payment successfully', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedRecordCustomerPayment.mockResolvedValueOnce({
      payment: { id: 'pay-1', amount: 500 },
      newBalance: 200,
    })

    const res = await POST(makeReq({ amount: 500, paymentMethod: 'UPI', reference: 'REF-1' }), {
      params: { id: 'cust-1' },
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.newBalance).toBe(200)
  })

  it('returns 400 for invalid amount', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(makeReq({ amount: -10 }), { params: { id: 'cust-1' } })
    expect(res.status).toBe(400)
  })
})
