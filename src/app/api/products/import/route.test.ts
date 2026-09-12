/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { POST } from '@/app/api/products/import/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { importProductsFromCsv } from '@/lib/products/product-import'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

// Keep the route's early size guard small so tests don't allocate huge payloads.
jest.mock('@/lib/constants/product-import', () => ({
  MAX_CSV_FILE_SIZE: 100,
  MAX_CSV_ROWS: 1000,
  REQUIRED_CSV_COLUMNS: ['name', 'sku', 'mrp', 'categories'],
  OPTIONAL_CSV_COLUMNS: [],
}))

jest.mock('@/lib/products/product-import', () => ({
  importProductsFromCsv: jest.fn(),
  MAX_CSV_FILE_SIZE: 100,
  MAX_CSV_ROWS: 1000,
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedImportProductsFromCsv = importProductsFromCsv as jest.Mock
const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeFormDataReq(formData: FormData): NextRequest {
  return new Request('http://localhost/api/products/import', {
    method: 'POST',
    body: formData,
  }) as unknown as NextRequest
}

function csvFile(content = 'name,sku,mrp,categories\nParacetamol,PCM-1,25,analgesics\n') {
  return new File([content], 'products.csv', { type: 'text/csv' })
}

const successSummary = {
  fileName: 'products.csv',
  totalRows: 1,
  imported: 1,
  failed: 0,
  errors: [],
}

const failureSummary = {
  fileName: 'products.csv',
  totalRows: 1,
  imported: 0,
  failed: 1,
  errors: [{ row: 2, field: 'mrp', message: 'Invalid input: expected number, received string' }],
}

describe('POST /api/products/import', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(makeFormDataReq(new FormData()))
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user lacks products:import', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Forbidden: requires products:import'))
    const res = await POST(makeFormDataReq(new FormData()))
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is provided', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(makeFormDataReq(new FormData()))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('CSV file upload is required')
    expect(mockedImportProductsFromCsv).not.toHaveBeenCalled()
  })

  it('returns 400 when the file field is not a file', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const fd = new FormData()
    fd.append('file', 'not-a-file-object')
    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an oversized file without invoking the service', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const fd = new FormData()
    fd.append('file', new File([new ArrayBuffer(101)], 'products.csv', { type: 'text/csv' }))
    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('maximum size')
    expect(mockedImportProductsFromCsv).not.toHaveBeenCalled()
  })

  it('imports successfully, writes an audit log, and returns a summary', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedImportProductsFromCsv.mockResolvedValueOnce(successSummary)
    mockedAuditLog.mockResolvedValueOnce({})

    const fd = new FormData()
    fd.append('file', csvFile())

    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.imported).toBe(1)
    expect(body.message).toContain('Imported 1 product')

    expect(mockedImportProductsFromCsv).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'products.csv', type: 'text/csv' }),
      'u1'
    )
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          action: 'CREATE',
          entity: 'Product',
          newData: expect.objectContaining({ method: 'csv-import', imported: 1 }),
        }),
      })
    )
  })

  it('returns 400 with the error report and does not audit when rows fail', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedImportProductsFromCsv.mockResolvedValueOnce(failureSummary)

    const fd = new FormData()
    fd.append('file', csvFile())

    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('IMPORT_FAILED')
    expect(body.error.summary.failed).toBe(1)
    expect(mockedAuditLog).not.toHaveBeenCalled()
  })

  it('maps a conflict error to 409', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedImportProductsFromCsv.mockRejectedValueOnce(
      new Error('Conflict: one or more SKU or barcode values already exist. No rows were imported.')
    )

    const fd = new FormData()
    fd.append('file', csvFile())

    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(409)
    expect(mockedAuditLog).not.toHaveBeenCalled()
  })

  it('returns 500 on an unexpected service error', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedImportProductsFromCsv.mockRejectedValueOnce(new Error('boom'))

    const fd = new FormData()
    fd.append('file', csvFile())

    const res = await POST(makeFormDataReq(fd))
    expect(res.status).toBe(500)
  })
})
