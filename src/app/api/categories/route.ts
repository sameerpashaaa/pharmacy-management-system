import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import {
  createCategory,
  getCategories,
  getCategoryBySlug,
  getCategoryTree,
} from '@/lib/products/product-service'
import { createCategorySchema } from '@/lib/validations/product'

// GET /api/categories?parentId=&isActive=&tree=
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.PRODUCTS_READ)

    const { searchParams } = new URL(req.url)
    const tree = searchParams.get('tree') === 'true'
    const parentId = searchParams.get('parentId')
    const isActiveRaw = searchParams.get('isActive')

    if (tree) {
      const data = await getCategoryTree()
      return NextResponse.json({ success: true, data })
    }

    const data = await getCategories({
      parentId: parentId ?? undefined,
      isActive: isActiveRaw === null ? undefined : isActiveRaw === 'true',
      includeChildren: parentId === null,
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// POST /api/categories
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.CATEGORIES_MANAGE)

    const body: unknown = await req.json()
    const data = createCategorySchema.parse(body)

    // Slug uniqueness
    const existing = await getCategoryBySlug(data.slug)
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Category slug already in use' } },
        { status: 409 }
      )
    }

    const category = await createCategory({
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      imageUrl: data.imageUrl || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    })

    return NextResponse.json(
      { success: true, data: category, message: 'Category created successfully' },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
            issues: err.flatten(),
          },
        },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 400
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
