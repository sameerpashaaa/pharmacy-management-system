/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET, POST } from '@/app/api/products/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import {
  checkBarcodeExists,
  checkSkuExists,
  createProduct,
  getProducts,
} from '@/lib/products/product-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/products/product-service', () => ({
  checkBarcodeExists: jest.fn(),
  checkSkuExists: jest.fn(),
  createProduct: jest.fn(),
  getProducts: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetProducts = getProducts as jest.Mock
const mockedCheckSkuExists = checkSkuExists as jest.Mock
const mockedCheckBarcodeExists = checkBarcodeExists as jest.Mock
const mockedCreateProduct = createProduct as jest.Mock
const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

const validBody = {
  name: 'Paracetamol 500mg',
  sku: 'PCM-500',
  barcode: '8901234567890',
  drugSchedule: 'NONE',
  isPrescriptionRequired: false,
  unitOfMeasure: 'Strip',
  hsnCode: '3004',
  gstRate: 12,
  cgstRate: 6,
  sgstRate: 6,
  igstRate: 12,
  isGstExempt: false,
  mrp: 25,
  ptr: 20,
  costPrice: 15,
  minStockLevel: 10,
  reorderLevel: 20,
  isActive: true,
  isReturnable: true,
  categoryIds: ['cat-1'],
}

describe('GET /api/products', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/products?page=1&limit=20'))
    expect(res.status).toBe(401)
  })

  it('returns products with pagination', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetProducts.mockResolvedValueOnce({
      data: [{ id: 'prod-1', name: 'Paracetamol' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await GET(makeReq('http://localhost/api/products?page=1&limit=20'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data[0].name).toBe('Paracetamol')
    expect(body.pagination.total).toBe(1)
  })

  it('passes search and category filter through', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetProducts.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    })
    await GET(makeReq('http://localhost/api/products?page=1&limit=20&search=para&categoryId=cat-1'))
    expect(mockedGetProducts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'para', categoryId: 'cat-1' })
    )
  })
})

describe('POST /api/products', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 when forbidden', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Forbidden: requires products:create'))
    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 for an invalid payload', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, sku: 'bad sku!' }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 when the SKU is already in use', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedCheckSkuExists.mockResolvedValueOnce(true)
    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CONFLICT')
  })

  it('returns 409 when the primary barcode is already in use', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedCheckSkuExists.mockResolvedValueOnce(false)
    mockedCheckBarcodeExists.mockResolvedValueOnce(true)
    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(409)
  })

  it('returns 409 when an additional barcode collides with the primary', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedCheckSkuExists.mockResolvedValueOnce(false)
    mockedCheckBarcodeExists.mockResolvedValueOnce(false)
    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...validBody,
          barcodes: [{ barcode: '8901234567890', type: 'EAN13', isPrimary: false }],
        }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.message).toContain('Duplicate barcode')
  })

  it('creates a product and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedCheckSkuExists.mockResolvedValueOnce(false)
    mockedCheckBarcodeExists.mockResolvedValueOnce(false)
    mockedCreateProduct.mockResolvedValueOnce({
      id: 'prod-1',
      name: 'Paracetamol 500mg',
      sku: 'PCM-500',
    })
    mockedAuditLog.mockResolvedValueOnce({})

    const res = await POST(
      makeReq('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(201)
    expect(mockedCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Paracetamol 500mg',
        sku: 'PCM-500',
        createdById: 'u1',
        categoryIds: ['cat-1'],
      })
    )
    expect(mockedAuditLog).toHaveBeenCalled()
    const body = await res.json()
    expect(body.message).toContain('created')
  })
})
