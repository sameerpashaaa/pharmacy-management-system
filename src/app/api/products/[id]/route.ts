import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import {
  checkBarcodeExists,
  checkSkuExists,
  deleteProduct,
  getProductById,
  updateProduct,
} from '@/lib/products/product-service'
import { updateProductSchema } from '@/lib/validations/product'

type RouteParams = { params: { id: string } }

// GET /api/products/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission(PERMISSIONS.PRODUCTS_READ)

    const product = await getProductById(params.id)
    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: product })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PUT /api/products/:id
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_UPDATE)

    const existing = await getProductById(params.id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } },
        { status: 404 }
      )
    }

    const body: unknown = await req.json()
    const data = updateProductSchema.parse(body)

    // SKU uniqueness
    if (data.sku && data.sku !== existing.sku && (await checkSkuExists(data.sku, params.id))) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'SKU already in use' } },
        { status: 409 }
      )
    }

    // Primary barcode uniqueness
    if (
      data.barcode &&
      data.barcode !== existing.barcode &&
      (await checkBarcodeExists(data.barcode, params.id))
    ) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Barcode already in use' } },
        { status: 409 }
      )
    }

    // Additional barcode uniqueness
    if (data.barcodes && data.barcodes.length > 0) {
      const extraBarcodes = data.barcodes.map((b) => b.barcode)
      const seen = new Set<string>()
      let hasDuplicate = false
      for (const barcode of extraBarcodes) {
        if (barcode === (data.barcode ?? existing.barcode) || seen.has(barcode)) {
          hasDuplicate = true
          break
        }
        seen.add(barcode)
      }
      if (hasDuplicate) {
        return NextResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'Duplicate barcode in request' } },
          { status: 409 }
        )
      }
      for (const b of extraBarcodes) {
        if (await checkBarcodeExists(b, params.id)) {
          return NextResponse.json(
            { success: false, error: { code: 'CONFLICT', message: `Barcode ${b} already in use` } },
            { status: 409 }
          )
        }
      }
    }

    const product = await updateProduct(params.id, {
      name: data.name,
      genericName: data.genericName === undefined ? undefined : data.genericName || null,
      sku: data.sku,
      barcode: data.barcode === undefined ? undefined : data.barcode || null,
      description: data.description === undefined ? undefined : data.description || null,
      manufacturer: data.manufacturer === undefined ? undefined : data.manufacturer || null,
      composition: data.composition === undefined ? undefined : data.composition || null,
      drugSchedule: data.drugSchedule,
      isPrescriptionRequired: data.isPrescriptionRequired,
      unitOfMeasure: data.unitOfMeasure,
      tabsPerStrip: data.tabsPerStrip,
      packSize: data.packSize === undefined ? undefined : data.packSize || null,
      hsnCode: data.hsnCode === undefined ? undefined : data.hsnCode || null,
      gstRate: data.gstRate,
      cgstRate: data.cgstRate,
      sgstRate: data.sgstRate,
      igstRate: data.igstRate,
      isGstExempt: data.isGstExempt,
      mrp: data.mrp,
      ptr: data.ptr === undefined ? undefined : data.ptr || null,
      costPrice: data.costPrice === undefined ? undefined : data.costPrice || null,
      minStockLevel: data.minStockLevel,
      maxStockLevel: data.maxStockLevel,
      reorderLevel: data.reorderLevel,
      imageUrl: data.imageUrl === undefined ? undefined : data.imageUrl || null,
      isActive: data.isActive,
      isReturnable: data.isReturnable,
      categoryIds: data.categoryIds,
      barcodes: data.barcodes,
    })

    // Audit
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'UPDATE', entity: 'Product', entityId: params.id },
    })

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
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

// DELETE /api/products/:id (soft delete — deactivate)
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_DELETE)

    const existing = await getProductById(params.id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } },
        { status: 404 }
      )
    }

    const product = await deleteProduct(params.id)

    // Audit
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'DELETE', entity: 'Product', entityId: params.id },
    })

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Product deactivated successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
