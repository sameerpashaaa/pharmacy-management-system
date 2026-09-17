/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET as consumptionGET } from '@/app/api/reports/consumption/route'
import { GET as expiryGET } from '@/app/api/reports/expiry/route'
import { GET as narcoticsGET } from '@/app/api/reports/narcotics/route'
import { GET as salesGET } from '@/app/api/reports/sales/route'
import { GET as stockGET } from '@/app/api/reports/stock/route'
import { GET as supplierGET } from '@/app/api/reports/supplier/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { ReportService } from '@/lib/reports/report-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/inventory/branch-access', () => ({
  resolveBranchScope: jest.fn(),
}))

jest.mock('@/lib/reports/report-service', () => ({
  ReportService: {
    getDailyStockPosition: jest.fn(),
    getNearExpiry: jest.fn(),
    getNarcoticRegister: jest.fn(),
    getConsumptionReport: jest.fn(),
    getSalesFinancials: jest.fn(),
    getSupplierPerformance: jest.fn(),
  },
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedResolveBranchScope = resolveBranchScope as jest.Mock
const mockedReportService = ReportService as unknown as Record<string, jest.Mock>

function makeReq(url: string): NextRequest {
  return { url } as unknown as NextRequest
}

function authBranch(branchId = 'br-1') {
  mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId })
  mockedBranch(branchId)
}

function mockedBranch(branchId: string | null) {
  mockedResolveBranchScope.mockResolvedValueOnce(branchId)
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/reports/stock', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await stockGET(makeReq('http://localhost/api/reports/stock'))
    expect(res.status).toBe(401)
  })

  it('rejects callers without the reports:inventory permission with 403', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'reports:inventory'")
    )
    const res = await stockGET(makeReq('http://localhost/api/reports/stock'))
    expect(res.status).toBe(403)
  })

  it('rejects unresolvable branch scope with 403', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1', branchId: null })
    mockedBranch(null)
    const res = await stockGET(makeReq('http://localhost/api/reports/stock'))
    expect(res.status).toBe(403)
  })

  it('returns paginated stock rows for an authorized user', async () => {
    authBranch()
    mockedReportService.getDailyStockPosition.mockResolvedValueOnce({
      data: [{ productId: 'p1' }],
      total: 1,
      page: 1,
      limit: 10,
    })
    const res = await stockGET(makeReq('http://localhost/api/reports/stock?page=1&limit=10'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.pagination).toMatchObject({ page: 1, limit: 10, total: 1 })
    expect(mockedReportService.getDailyStockPosition).toHaveBeenCalledWith('br-1', {
      page: 1,
      limit: 10,
    })
  })

  it('rejects invalid pagination with 400', async () => {
    authBranch()
    const res = await stockGET(makeReq('http://localhost/api/reports/stock?limit=abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })
})

describe('GET /api/reports/expiry', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await expiryGET(makeReq('http://localhost/api/reports/expiry'))
    expect(res.status).toBe(401)
  })

  it('rejects invalid daysThreshold with 400', async () => {
    authBranch()
    const res = await expiryGET(makeReq('http://localhost/api/reports/expiry?daysThreshold=soon'))
    expect(res.status).toBe(400)
  })

  it('returns expiry rows for an authorized user', async () => {
    authBranch()
    mockedReportService.getNearExpiry.mockResolvedValueOnce({
      data: [{ batchId: 'b1' }],
      total: 1,
      page: 1,
      limit: 500,
    })
    const res = await expiryGET(makeReq('http://localhost/api/reports/expiry?daysThreshold=30'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(mockedReportService.getNearExpiry).toHaveBeenCalledWith('br-1', 30, {
      page: 1,
      limit: 500,
    })
    expect(body.pagination.total).toBe(1)
  })
})

describe('GET /api/reports/narcotics', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await narcoticsGET(makeReq('http://localhost/api/reports/narcotics'))
    expect(res.status).toBe(401)
  })

  it('rejects malformed dates with 400', async () => {
    authBranch()
    const res = await narcoticsGET(
      makeReq('http://localhost/api/reports/narcotics?startDate=not-a-date')
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })

  it('rejects startDate after endDate with 400', async () => {
    authBranch()
    const res = await narcoticsGET(
      makeReq('http://localhost/api/reports/narcotics?startDate=2026-09-10&endDate=2026-09-01')
    )
    expect(res.status).toBe(400)
  })

  it('returns narcotics rows for an authorized user', async () => {
    authBranch()
    mockedReportService.getNarcoticRegister.mockResolvedValueOnce({
      data: [{ id: 'm1' }],
      total: 1,
      page: 1,
      limit: 500,
    })
    const res = await narcoticsGET(
      makeReq('http://localhost/api/reports/narcotics?startDate=2026-09-01&endDate=2026-09-10')
    )
    expect(res.status).toBe(200)
    expect(mockedReportService.getNarcoticRegister).toHaveBeenCalledWith(
      'br-1',
      new Date('2026-09-01'),
      new Date('2026-09-10'),
      { page: 1, limit: 500 }
    )
  })
})

describe('GET /api/reports/consumption', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await consumptionGET(makeReq('http://localhost/api/reports/consumption'))
    expect(res.status).toBe(401)
  })

  it('rejects malformed dates with 400', async () => {
    authBranch()
    const res = await consumptionGET(
      makeReq('http://localhost/api/reports/consumption?endDate=not-a-date')
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })

  it('rejects startDate after endDate with 400', async () => {
    authBranch()
    const res = await consumptionGET(
      makeReq('http://localhost/api/reports/consumption?startDate=2026-09-10&endDate=2026-09-01')
    )
    expect(res.status).toBe(400)
  })

  it('returns consumption rows for an authorized user', async () => {
    authBranch()
    mockedReportService.getConsumptionReport.mockResolvedValueOnce({
      data: [{ productId: 'p1', totalConsumed: 5 }],
      total: 1,
      page: 1,
      limit: 500,
    })
    const res = await consumptionGET(
      makeReq('http://localhost/api/reports/consumption?startDate=2026-09-01&endDate=2026-09-10')
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data[0].totalConsumed).toBe(5)
  })
})

describe('GET /api/reports/sales', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await salesGET(makeReq('http://localhost/api/reports/sales'))
    expect(res.status).toBe(401)
  })

  it('rejects callers without the reports:sales permission with 403', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'reports:sales'")
    )
    const res = await salesGET(makeReq('http://localhost/api/reports/sales'))
    expect(res.status).toBe(403)
  })

  it('rejects invalid dates with 400', async () => {
    authBranch()
    const res = await salesGET(makeReq('http://localhost/api/reports/sales?startDate=junk'))
    expect(res.status).toBe(400)
  })

  it('returns the financial summary for an authorized user', async () => {
    authBranch()
    mockedReportService.getSalesFinancials.mockResolvedValueOnce({
      totalSalesCount: 2,
      totalRevenue: 1000,
      totalTax: 100,
      totalDiscount: 50,
      excludedSalesCount: 1,
      dailyBreakdown: [],
    })
    const res = await salesGET(
      makeReq('http://localhost/api/reports/sales?startDate=2026-09-01&endDate=2026-09-10')
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.totalRevenue).toBe(1000)
    expect(body.data.excludedSalesCount).toBe(1)
  })
})

describe('GET /api/reports/supplier', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await supplierGET(makeReq('http://localhost/api/reports/supplier'))
    expect(res.status).toBe(401)
  })

  it('rejects callers without the reports:purchases permission with 403', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'reports:purchases'")
    )
    const res = await supplierGET(makeReq('http://localhost/api/reports/supplier'))
    expect(res.status).toBe(403)
  })

  it('returns supplier rows for an authorized user', async () => {
    authBranch()
    mockedReportService.getSupplierPerformance.mockResolvedValueOnce({
      data: [{ supplierId: 's1' }],
      total: 1,
      page: 1,
      limit: 500,
    })
    const res = await supplierGET(
      makeReq('http://localhost/api/reports/supplier?startDate=2026-09-01&endDate=2026-09-10')
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.pagination.total).toBe(1)
  })
})
