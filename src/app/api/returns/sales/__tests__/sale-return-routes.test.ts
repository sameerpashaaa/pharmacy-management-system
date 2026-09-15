/** @jest-environment node */
import { NextRequest } from 'next/server'

import { GET as returnDetailGET } from '@/app/api/returns/sales/[id]/route'
import {
  GET as returnsGET,
  POST as returnsPOST,
} from '@/app/api/returns/sales/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import {
  createSaleReturn,
  getSaleReturnById,
  listSaleReturns,
} from '@/lib/returns/sale-return-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/returns/sale-return-service', () => ({
  createSaleReturn: jest.fn(),
  listSaleReturns: jest.fn(),
  getSaleReturnById: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock
const mockedService = {
  createSaleReturn: createSaleReturn as jest.Mock,
  listSaleReturns: listSaleReturns as jest.Mock,
  getSaleReturnById: getSaleReturnById as jest.Mock,
}

const mockUser = {
  id: 'user-1',
  branchId: 'branch-1',
  permissions: ['returns:read', 'returns:create'],
}

describe('Sale Returns API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedPermission.mockResolvedValue(mockUser)
  })

  describe('GET /api/returns/sales', () => {
    it('returns paginated sale returns', async () => {
      mockedService.listSaleReturns.mockResolvedValue({
        data: [{ id: 'ret-1', returnNumber: 'SR-1001' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      })

      const req = new NextRequest('http://localhost:3000/api/returns/sales?page=1&limit=20')
      const res = await returnsGET(req)
      const json = await (res.json() as Promise<{ success: boolean; data: unknown[] }>)

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toHaveLength(1)
    })
  })

  describe('POST /api/returns/sales', () => {
    it('creates sale return with 201 status', async () => {
      const created = { id: 'ret-new', returnNumber: 'SR-2026-9999' }
      mockedService.createSaleReturn.mockResolvedValue(created)

      const req = new NextRequest('http://localhost:3000/api/returns/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: 'sale-1',
          reason: 'Defective blister pack',
          refundMethod: 'CASH',
          items: [{ saleItemId: 'item-1', quantity: 1, restockDecision: 'RESTOCK' }],
        }),
      })

      const res = await returnsPOST(req)
      const json = await (res.json() as Promise<{ success: boolean; data: unknown }>)

      expect(res.status).toBe(201)
      expect(json.success).toBe(true)
      expect(json.data).toEqual(created)
    })

    it('returns 400 when validation fails', async () => {
      const req = new NextRequest('http://localhost:3000/api/returns/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: '', items: [] }),
      })

      const res = await returnsPOST(req)
      const json = await (res.json() as Promise<{ success: boolean; error: { code: string } }>)

      expect(res.status).toBe(400)
      expect(json.error.code).toBe('VALIDATION')
    })
  })

  describe('GET /api/returns/sales/[id]', () => {
    it('returns sale return detail', async () => {
      const ret = { id: 'ret-1', returnNumber: 'SR-1' }
      mockedService.getSaleReturnById.mockResolvedValue(ret)

      const req = new NextRequest('http://localhost:3000/api/returns/sales/ret-1')
      const res = await returnDetailGET(req, { params: { id: 'ret-1' } })
      const json = await (res.json() as Promise<{ success: boolean; data: unknown }>)

      expect(res.status).toBe(200)
      expect(json.data).toEqual(ret)
    })

    it('returns 404 if not found', async () => {
      mockedService.getSaleReturnById.mockRejectedValue(new Error('Not Found: sale return'))

      const req = new NextRequest('http://localhost:3000/api/returns/sales/missing')
      const res = await returnDetailGET(req, { params: { id: 'missing' } })

      expect(res.status).toBe(404)
    })
  })
})
