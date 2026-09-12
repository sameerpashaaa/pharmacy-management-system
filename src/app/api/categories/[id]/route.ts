import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import {
  deleteCategory,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
} from '@/lib/products/product-service'
import { updateCategorySchema } from '@/lib/validations/product'

type RouteParams = { params: { id: string } }

// GET /api/categories/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.PRODUCTS_READ)

    const category = await getCategoryById(params.id)
    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: category })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PUT /api/categories/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.CATEGORIES_MANAGE)

    const existing = await getCategoryById(params.id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } },
        { status: 404 }
      )
    }

    const body: unknown = await req.json()
    const data = updateCategorySchema.parse(body)

    // Prevent self-parent cycle
    if (data.parentId === params.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION', message: 'A category cannot be its own parent' },
        },
        { status: 400 }
      )
    }

    // Slug uniqueness (if being changed)
    if (data.slug && data.slug !== existing.slug) {
      const slugOwner = await getCategoryBySlug(data.slug)
      if (slugOwner && slugOwner.id !== params.id) {
        return NextResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'Category slug already in use' } },
          { status: 409 }
        )
      }
    }

    const category = await updateCategory(params.id, {
      name: data.name,
      slug: data.slug,
      description: data.description,
      parentId: data.parentId,
      imageUrl: data.imageUrl,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    })

    return NextResponse.json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    })
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

// DELETE /api/categories/:id (soft delete — deactivate)
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.CATEGORIES_MANAGE)

    const existing = await getCategoryById(params.id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } },
        { status: 404 }
      )
    }

    const category = await deleteCategory(params.id)

    return NextResponse.json({
      success: true,
      data: category,
      message: 'Category deactivated successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
