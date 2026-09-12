/** @jest-environment node */
import type { NextRequest } from 'next/server'

import { GET, POST } from '@/app/api/categories/route'
import { requirePermission } from '@/lib/auth/auth-helpers'
import {
  createCategory,
  getCategories,
  getCategoryBySlug,
  getCategoryTree,
} from '@/lib/products/product-service'

jest.mock('@/lib/auth/auth-helpers', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/products/product-service', () => ({
  createCategory: jest.fn(),
  getCategories: jest.fn(),
  getCategoryBySlug: jest.fn(),
  getCategoryTree: jest.fn(),
}))

const mockedRequirePermission = requirePermission as jest.Mock
const mockedGetCategories = getCategories as jest.Mock
const mockedGetCategoryTree = getCategoryTree as jest.Mock
const mockedGetCategoryBySlug = getCategoryBySlug as jest.Mock
const mockedCreateCategory = createCategory as jest.Mock

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest
}

describe('GET /api/categories', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await GET(makeReq('http://localhost/api/categories'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when forbidden', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error("Forbidden: requires permission 'products:read'")
    )
    const res = await GET(makeReq('http://localhost/api/categories'))
    expect(res.status).toBe(403)
  })

  it('returns the category list', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetCategories.mockResolvedValueOnce([{ id: 'cat-1', name: 'Tablets' }])
    const res = await GET(makeReq('http://localhost/api/categories'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data[0].name).toBe('Tablets')
  })

  it('returns the tree when tree=true', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetCategoryTree.mockResolvedValueOnce([{ id: 'cat-1', children: [] }])
    const res = await GET(makeReq('http://localhost/api/categories?tree=true'))
    const body = await res.json()
    expect(mockedGetCategoryTree).toHaveBeenCalled()
    expect(body.data).toHaveLength(1)
  })

  it('applies isActive filter from query params', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetCategories.mockResolvedValueOnce([])
    await GET(makeReq('http://localhost/api/categories?isActive=true'))
    expect(mockedGetCategories).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }))
  })
})

describe('POST /api/categories', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 when forbidden', async () => {
    mockedRequirePermission.mockRejectedValueOnce(
      new Error('Forbidden: requires categories:manage')
    )
    const res = await POST(
      makeReq('http://localhost/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Tablets', slug: 'tablets' }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 for an invalid body', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    const res = await POST(
      makeReq('http://localhost/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: '', slug: '' }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION')
  })

  it('returns 409 when the slug is already in use', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetCategoryBySlug.mockResolvedValueOnce({ id: 'existing', slug: 'tablets' })
    const res = await POST(
      makeReq('http://localhost/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Tablets', slug: 'tablets' }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(409)
  })

  it('creates a category and returns 201', async () => {
    mockedRequirePermission.mockResolvedValueOnce({ id: 'u1' })
    mockedGetCategoryBySlug.mockResolvedValueOnce(null)
    mockedCreateCategory.mockResolvedValueOnce({ id: 'cat-1', name: 'Tablets', slug: 'tablets' })
    const res = await POST(
      makeReq('http://localhost/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Tablets', slug: 'tablets', sortOrder: 1, isActive: true }),
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(res.status).toBe(201)
    expect(mockedCreateCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tablets', slug: 'tablets' })
    )
  })
})
