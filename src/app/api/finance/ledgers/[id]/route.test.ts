/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getLedgerById } from '@/lib/finance/finance-service'

import { GET } from './route'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/finance/finance-service', () => ({
  getLedgerById: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetLedgerById = getLedgerById as jest.Mock

function makeReq(): NextRequest {
  return { nextUrl: new URL('http://localhost/api/finance/ledgers/led-1') } as unknown as NextRequest
}

describe('GET /api/finance/ledgers/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires finance read permission', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq(), { params: { id: 'led-1' } })
    expect(res.status).toBe(401)
  })

  it('returns ledger details', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetLedgerById.mockResolvedValueOnce({
      id: 'led-1',
      code: '1010',
      name: 'Cash on Hand',
      type: 'ASSET',
      balance: 500,
    })

    const res = await GET(makeReq(), { params: { id: 'led-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.code).toBe('1010')
  })

  it('returns 404 if ledger not found', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetLedgerById.mockRejectedValueOnce(new Error('Not Found: ledger'))

    const res = await GET(makeReq(), { params: { id: 'non-existent' } })
    expect(res.status).toBe(404)
  })
})