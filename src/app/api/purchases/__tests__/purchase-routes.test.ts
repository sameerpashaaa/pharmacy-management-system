/** @jest-environment node */
import { NextRequest } from 'next/server'

import { GET as grnGET } from '@/app/api/grn/route'
import { GET as returnsGET, POST as returnsPOST } from '@/app/api/purchase-returns/route'
import { POST as grnPOST } from '@/app/api/purchases/[id]/grn/route'
import { GET as purchasesGET, POST as purchasesPOST } from '@/app/api/purchases/route'
import { GET as supplierGET, PATCH as supplierPATCH } from '@/app/api/suppliers/[id]/route'
import { GET as suppliersGET, POST as suppliersPOST } from '@/app/api/suppliers/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import {
  createGrn,
  createPurchase,
  createPurchaseReturn,
  createSupplier,
  getSupplier,
  listGrns,
  listPurchaseReturns,
  listPurchases,
  listSuppliers,
  updateSupplier,
} from '@/lib/purchases/purchase-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/purchases/purchase-service', () => ({
  createSupplier: jest.fn(),
  listSuppliers: jest.fn(),
  getSupplier: jest.fn(),
  updateSupplier: jest.fn(),
  createPurchase: jest.fn(),
  listPurchases: jest.fn(),
  createGrn: jest.fn(),
  listGrns: jest.fn(),
  createPurchaseReturn: jest.fn(),
  listPurchaseReturns: jest.fn(),
}))

const mockedPermission = requirePermission as jest.Mock
const mockedSupplier = {
  createSupplier: createSupplier as jest.Mock,
  listSuppliers: listSuppliers as jest.Mock,
  getSupplier: getSupplier as jest.Mock,
  updateSupplier: updateSupplier as jest.Mock,
}
const mockedPurchase = {
  createPurchase: createPurchase as jest.Mock,
  listPurchases: listPurchases as jest.Mock,
}
const mockedGrn = {
  createGrn: createGrn as jest.Mock,
  listGrns: listGrns as jest.Mock,
}
const mockedReturn = {
  createPurchaseReturn: createPurchaseReturn as jest.Mock,
  listPurchaseReturns: listPurchaseReturns as jest.Mock,
}

const manager = () => ({
  id: 'u1',
  branchId: 'br-1',
  permissions: ['purchases:create', 'purchases:read', 'purchases:receive', 'purchases:update'],
})
const supplierManager = () => ({
  id: 'u1',
  branchId: 'br-1',
  permissions: ['suppliers:create', 'suppliers:read', 'suppliers:update', 'suppliers:payments'],
})
const returnManager = () => ({
  id: 'u1',
  branchId: 'br-1',
  permissions: ['purchases:read', 'returns:create'],
})

function makeReq(url: string, body?: unknown, method?: string): NextRequest {
  return new NextRequest(url, {
    method: method ?? (body ? 'POST' : 'GET'),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

describe('GET/POST /api/purchases', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects callers without a session', async () => {
    mockedPermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await purchasesGET(makeReq('http://localhost/api/purchases'))
    expect(res.status).toBe(401)
  })

  it('rejects callers without the purchases:read permission', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'purchases:read'")
    )
    const res = await purchasesGET(makeReq('http://localhost/api/purchases'))
    expect(res.status).toBe(403)
  })

  it('lists purchases for an authorized user', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    mockedPurchase.listPurchases.mockResolvedValueOnce({
      data: [{ id: 'po1', purchaseNumber: 'PO-1' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await purchasesGET(makeReq('http://localhost/api/purchases'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(mockedPurchase.listPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
      manager()
    )
  })

  it('validates the purchase list query', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    const res = await purchasesGET(makeReq('http://localhost/api/purchases?limit=999'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })

  it('creates a purchase order with a 201', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    mockedPurchase.createPurchase.mockResolvedValueOnce({ id: 'po1', status: 'DRAFT' })
    const res = await purchasesPOST(
      makeReq('http://localhost/api/purchases', {
        branchId: 'br-1',
        supplierId: 's1',
        items: [{ productId: 'p1', orderedQuantity: 10, unitCost: 5 }],
      })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.id).toBe('po1')
  })

  it('rejects purchase payloads that fail Zod validation', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    const res = await purchasesPOST(makeReq('http://localhost/api/purchases', { branchId: 'br-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })
})

describe('POST /api/purchases/:id/grn', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects callers without the purchases:receive permission', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'purchases:receive'")
    )
    const res = await grnPOST(
      makeReq('http://localhost/api/purchases/po1/grn', {
        purchaseId: 'po1',
        branchId: 'br-1',
        grnNumber: 'GRN-1',
        grnDate: new Date().toISOString(),
        items: [
          {
            purchaseItemId: 'pi1',
            receivedQuantity: 10,
            batchNumber: 'BT-1',
            expiryDate: new Date(Date.now() + 200 * 86400000).toISOString(),
            purchasePrice: 5,
            mrp: 10,
            qualityCheckPassed: true,
          },
        ],
      }),
      { params: { id: 'po1' } }
    )
    expect(res.status).toBe(403)
  })

  it('requires the body purchaseId to match the URL param', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    const res = await grnPOST(
      makeReq('http://localhost/api/purchases/po1/grn', {
        purchaseId: 'OTHER',
        branchId: 'br-1',
        grnNumber: 'GRN-1',
        grnDate: new Date().toISOString(),
        items: [
          {
            purchaseItemId: 'pi1',
            receivedQuantity: 10,
            batchNumber: 'BT-1',
            expiryDate: new Date().toISOString(),
            purchasePrice: 5,
            mrp: 10,
            qualityCheckPassed: true,
          },
        ],
      }),
      { params: { id: 'po1' } }
    )
    expect(res.status).toBe(400)
  })

  it('receives a GRN against the purchase', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    mockedGrn.createGrn.mockResolvedValueOnce({
      grn: { id: 'po1', grnNumber: 'GRN-1' },
      purchase: { id: 'po1', status: 'RECEIVED' },
    })
    const res = await grnPOST(
      makeReq('http://localhost/api/purchases/po1/grn', {
        purchaseId: 'po1',
        branchId: 'br-1',
        grnNumber: 'GRN-1',
        grnDate: new Date().toISOString(),
        items: [
          {
            purchaseItemId: 'pi1',
            receivedQuantity: 10,
            batchNumber: 'BT-1',
            expiryDate: new Date(Date.now() + 200 * 86400000).toISOString(),
            purchasePrice: 5,
            mrp: 10,
            qualityCheckPassed: true,
          },
        ],
      }),
      { params: { id: 'po1' } }
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.grn.grnNumber).toBe('GRN-1')
  })

  it('rejects date-only GRN dates (YYYY-MM-DD) with 400 VALIDATION', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    const res = await grnPOST(
      makeReq('http://localhost/api/purchases/po1/grn', {
        purchaseId: 'po1',
        branchId: 'br-1',
        grnNumber: 'GRN-1',
        grnDate: '2026-09-19',
        items: [
          {
            purchaseItemId: 'pi1',
            receivedQuantity: 10,
            batchNumber: 'BT-1',
            expiryDate: '2027-09-19',
            purchasePrice: 5,
            mrp: 10,
            qualityCheckPassed: true,
          },
        ],
      }),
      { params: { id: 'po1' } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
    expect(mockedGrn.createGrn).not.toHaveBeenCalled()
  })
})

describe('GET/POST /api/suppliers', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires suppliers:read', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'suppliers:read'")
    )
    const res = await suppliersGET(makeReq('http://localhost/api/suppliers'))
    expect(res.status).toBe(403)
  })

  it('lists suppliers', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    mockedSupplier.listSuppliers.mockResolvedValueOnce({
      data: [{ id: 's1', name: 'Medicare' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await suppliersGET(makeReq('http://localhost/api/suppliers'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data[0].name).toBe('Medicare')
  })

  it('creates a supplier with a 201', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    mockedSupplier.createSupplier.mockResolvedValueOnce({ id: 's1', name: 'Fresh' })
    const res = await suppliersPOST(
      makeReq('http://localhost/api/suppliers', { name: 'Fresh' }, 'POST')
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.name).toBe('Fresh')
  })

  it('rejects supplier payloads that fail Zod validation', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    const res = await suppliersPOST(makeReq('http://localhost/api/suppliers', { name: '' }, 'POST'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })
})

describe('GET/PATCH /api/suppliers/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 404 for a missing supplier', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    mockedSupplier.getSupplier.mockResolvedValueOnce(null)
    const res = await supplierGET(makeReq('http://localhost/api/suppliers/nope'), {
      params: { id: 'nope' },
    })
    expect(res.status).toBe(404)
  })

  it('returns a supplier by id', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    mockedSupplier.getSupplier.mockResolvedValueOnce({ id: 's1', name: 'Medicare' })
    const res = await supplierGET(makeReq('http://localhost/api/suppliers/s1'), {
      params: { id: 's1' },
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Medicare')
  })

  it('updates a supplier', async () => {
    mockedPermission.mockResolvedValueOnce(supplierManager())
    mockedSupplier.updateSupplier.mockResolvedValueOnce({ id: 's1', creditDays: 45 })
    const res = await supplierPATCH(
      makeReq('http://localhost/api/suppliers/s1', { creditDays: 45 }, 'PATCH'),
      { params: { id: 's1' } }
    )
    expect(res.status).toBe(200)
  })
})

describe('GET /api/grn', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects callers without the purchases:read permission', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'purchases:read'")
    )
    const res = await grnGET(makeReq('http://localhost/api/grn'))
    expect(res.status).toBe(403)
  })

  it('lists GRNs', async () => {
    mockedPermission.mockResolvedValueOnce(manager())
    mockedGrn.listGrns.mockResolvedValueOnce({
      data: [{ id: 'po1', grnNumber: 'GRN-1', purchaseId: 'po1' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await grnGET(makeReq('http://localhost/api/grn'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data[0].grnNumber).toBe('GRN-1')
  })
})

describe('GET/POST /api/purchase-returns', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects callers without the returns:create permission on POST', async () => {
    mockedPermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'returns:create'")
    )
    const res = await returnsPOST(
      makeReq('http://localhost/api/purchase-returns', {
        purchaseId: 'po1',
        supplierId: 's1',
        returnNumber: 'PR-1',
        returnDate: new Date().toISOString(),
        reason: 'Damaged',
        items: [{ purchaseItemId: 'pi1', quantity: 1, unitCost: 5, reason: 'Damaged' }],
      })
    )
    expect(res.status).toBe(403)
  })

  it('creates a purchase return with a 201', async () => {
    mockedPermission.mockResolvedValueOnce(returnManager())
    mockedReturn.createPurchaseReturn.mockResolvedValueOnce({ id: 'pr1', status: 'PENDING' })
    const res = await returnsPOST(
      makeReq('http://localhost/api/purchase-returns', {
        purchaseId: 'po1',
        supplierId: 's1',
        returnNumber: 'PR-1',
        returnDate: new Date().toISOString(),
        reason: 'Damaged',
        items: [{ purchaseItemId: 'pi1', quantity: 1, unitCost: 5, reason: 'Damaged' }],
      })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.status).toBe('PENDING')
  })

  it('lists purchase returns', async () => {
    mockedPermission.mockResolvedValueOnce(returnManager())
    mockedReturn.listPurchaseReturns.mockResolvedValueOnce({
      data: [{ id: 'pr1', returnNumber: 'PR-1' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await returnsGET(makeReq('http://localhost/api/purchase-returns'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data[0].returnNumber).toBe('PR-1')
  })
})
