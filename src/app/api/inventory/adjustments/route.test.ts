/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET, POST } from '@/app/api/inventory/adjustments/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { assertBranchAccess, resolveBranchScope } from '@/lib/inventory/branch-access'
import { createAdjustment, getAdjustments } from '@/lib/inventory/inventory-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  assertBranchAccess: jest.fn(),
  resolveBranchScope: jest.fn(),
}))

jest.mock('@/lib/inventory/inventory-service', () => ({
  createAdjustment: jest.fn(),
  getAdjustments: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedAssertBranchAccess = assertBranchAccess as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock
const mockedCreateAdjustment = createAdjustment as jest.Mock
const mockedGetAdjustments = getAdjustments as jest.Mock

const mockedAuditLog = jest.fn()
const prismaMock = prisma as unknown as { auditLog: { create: jest.Mock } }
prismaMock.auditLog.create = mockedAuditLog

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

const validBody = {
  branchId: 'br-1',
  productId: 'prod-1',
  adjustmentType: 'PHYSICAL_COUNT',
  quantity: 5,
  reason: 'Cycle count',
}

describe('GET /api/inventory/adjustments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/inventory/adjustments'))
    expect(res.status).toBe(401)
  })

  it('returns adjustment rows with pagination', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedResolveBranchScope.mockResolvedValueOnce(null)
    mockedGetAdjustments.mockResolvedValueOnce({
      data: [{ id: 'adj-1', status: 'PENDING' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    const res = await GET(makeReq('http://localhost/api/inventory/adjustments?status=PENDING'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data[0].id).toBe('adj-1')
  })

  it('returns 400 for invalid status', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    const res = await GET(makeReq('http://localhost/api/inventory/adjustments?status=YEP'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/inventory/adjustments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates an adjustment and writes an audit log', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedAssertBranchAccess.mockResolvedValueOnce(undefined)
    mockedCreateAdjustment.mockResolvedValueOnce({
      id: 'adj-1',
      branchId: 'br-1',
      productId: 'prod-1',
      quantity: 5,
      adjustmentType: 'PHYSICAL_COUNT',
      status: 'APPROVED',
    })

    const res = await POST(
      makeReq('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('APPROVED')
    expect(body.message).toBe('Adjustment applied (auto-approved)')
    expect(mockedCreateAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5, branchId: 'br-1' }),
      { id: 'u1', branchId: 'br-1' }
    )
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE' }) })
    )
  })

  it('returns 400 for invalid input', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    const res = await POST(
      makeReq('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, quantity: 0 }),
      })
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION')
  })

  it('returns 403 when the user has no access to the branch', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedAssertBranchAccess.mockRejectedValueOnce(new Error('Forbidden: no access to branch'))
    const res = await POST(
      makeReq('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      })
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 when stock is insufficient', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: 'br-1' })
    mockedAssertBranchAccess.mockResolvedValueOnce(undefined)
    mockedCreateAdjustment.mockRejectedValueOnce(
      new Error('Insufficient available stock: available 2')
    )
    const res = await POST(
      makeReq('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, quantity: -5 }),
      })
    )
    expect(res.status).toBe(400)
  })
})
