/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET as posConfigGET } from '@/app/api/pos/config/route'
import { DELETE as heldBillDELETE } from '@/app/api/pos/held-bills/[id]/route'
import { GET as heldBillsGET, POST as heldBillsPOST } from '@/app/api/pos/held-bills/route'
import { GET as posProductsGET } from '@/app/api/pos/products/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import {
  createHeldBill,
  deleteHeldBill,
  listHeldBills,
  searchPosProducts,
} from '@/lib/sales/sales-service'
import { getPosSettings } from '@/lib/settings/settings-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

jest.mock('@/lib/sales/sales-service', () => ({
  searchPosProducts: jest.fn(),
  createHeldBill: jest.fn(),
  listHeldBills: jest.fn(),
  deleteHeldBill: jest.fn(),
}))

jest.mock('@/lib/settings/settings-service', () => ({
  getPosSettings: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock
const mockedScope = resolveBranchScope as jest.Mock
const mockedService = {
  searchPosProducts: searchPosProducts as jest.Mock,
  createHeldBill: createHeldBill as jest.Mock,
  listHeldBills: listHeldBills as jest.Mock,
  deleteHeldBill: deleteHeldBill as jest.Mock,
}
const mockedSettings = getPosSettings as jest.Mock

const cashier = () => ({ id: 'u1', branchId: 'br-1', permissions: ['sales:create', 'sales:read'] })

function makeReq(url: string, body?: unknown): NextRequest {
  return new Request(
    url,
    body ? { method: 'POST', body: JSON.stringify(body) } : undefined
  ) as NextRequest
}

describe('GET /api/pos/products', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires a branch scope for POS search', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedScope.mockResolvedValueOnce(null)
    const res = await posProductsGET(makeReq('http://localhost/api/pos/products?search=para'))
    expect(res.status).toBe(400)
  })

  it('searches active products for the resolved branch', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedScope.mockResolvedValueOnce('br-1')
    mockedService.searchPosProducts.mockResolvedValueOnce([{ id: 'p1', availableQuantity: 5 }])

    const res = await posProductsGET(makeReq('http://localhost/api/pos/products?search=para'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(mockedService.searchPosProducts).toHaveBeenCalledWith('para', 'br-1', 20)
  })

  it('validates the query', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedScope.mockResolvedValueOnce('br-1')
    const res = await posProductsGET(makeReq('http://localhost/api/pos/products?limit=999'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/pos/config', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects callers without the sales create permission', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'sales:create'")
    )
    const res = await posConfigGET()
    expect(res.status).toBe(403)
  })

  it('returns the POS runtime configuration', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedSettings.mockResolvedValueOnce({ maxDiscountPercent: 20, roundOffTotal: true })
    const res = await posConfigGET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.maxDiscountPercent).toBe(20)
  })
})

describe('GET/POST /api/pos/held-bills', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists held bills scoped to the caller', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedScope.mockResolvedValueOnce('br-1')
    mockedService.listHeldBills.mockResolvedValueOnce([{ id: 'hb1' }])

    const res = await heldBillsGET(makeReq('http://localhost/api/pos/held-bills'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('creates a held bill', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedService.createHeldBill.mockResolvedValueOnce({ id: 'hb1' })

    const res = await heldBillsPOST(
      makeReq('http://localhost/api/pos/held-bills', { cartData: { items: [] }, label: 'Later' })
    )
    expect(res.status).toBe(201)
  })

  it('rejects a held bill without cart data', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    const res = await heldBillsPOST(makeReq('http://localhost/api/pos/held-bills', {}))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/pos/held-bills/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deletes the caller’s held bill', async () => {
    mockedPermission.mockResolvedValueOnce(cashier())
    mockedService.deleteHeldBill.mockResolvedValueOnce(undefined)
    const res = await heldBillDELETE(makeReq('http://localhost/api/pos/held-bills/hb1'), {
      params: { id: 'hb1' },
    } as never)
    expect(res.status).toBe(200)
    expect(mockedService.deleteHeldBill).toHaveBeenCalledWith(
      'hb1',
      expect.objectContaining({ id: 'u1' })
    )
  })
})
