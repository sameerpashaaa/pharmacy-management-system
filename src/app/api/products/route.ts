import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { prisma } from '@/lib/db/prisma'
import {
  checkBarcodeExists,
  checkSkuExists,
  createProduct,
  getProducts,
} from '@/lib/products/product-service'
import { createProductSchema, productListQuerySchema } from '@/lib/validations/product'

// GET /api/products?page=&limit=&search=&categoryId=&isActive=&sortBy=&sortOrder=
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.PRODUCTS_READ)

    const { searchParams } = new URL(req.url)
    const query = productListQuerySchema.parse(Object.fromEntries(searchParams))

    const result = await getProducts(query)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// POST /api/products
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_CREATE)
    const userId = user.id

    const body: unknown = await req.json()
    const data = createProductSchema.parse(body)

    // SKU uniqueness
    if (await checkSkuExists(data.sku)) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'SKU already in use' } },
        { status: 409 }
      )
    }

    // Primary barcode uniqueness
    if (data.barcode && (await checkBarcodeExists(data.barcode))) {
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
        if (barcode === data.barcode || seen.has(barcode)) {
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
        if (await checkBarcodeExists(b)) {
          return NextResponse.json(
            { success: false, error: { code: 'CONFLICT', message: `Barcode ${b} already in use` } },
            { status: 409 }
          )
        }
      }
    }

    const product = await createProduct({
      name: data.name,
      genericName: data.genericName ?? null,
      sku: data.sku,
      barcode: data.barcode || null,
      description: data.description ?? null,
      manufacturer: data.manufacturer ?? null,
      composition: data.composition ?? null,
      drugSchedule: data.drugSchedule,
      isPrescriptionRequired: data.isPrescriptionRequired,
      unitOfMeasure: data.unitOfMeasure,
      tabsPerStrip: data.tabsPerStrip ?? null,
      packSize: data.packSize ?? null,
      hsnCode: data.hsnCode || null,
      gstRate: data.gstRate,
      cgstRate: data.cgstRate,
      sgstRate: data.sgstRate,
      igstRate: data.igstRate,
      isGstExempt: data.isGstExempt,
      mrp: data.mrp,
      ptr: data.ptr ?? null,
      costPrice: data.costPrice ?? null,
      minStockLevel: data.minStockLevel,
      maxStockLevel: data.maxStockLevel ?? null,
      reorderLevel: data.reorderLevel,
      imageUrl: data.imageUrl || null,
      isActive: data.isActive,
      isReturnable: data.isReturnable,
      createdById: userId,
      categoryIds: data.categoryIds,
      barcodes: data.barcodes,
    })

    // Audit
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'Product',
        entityId: product.id,
        newData: { name: product.name, sku: product.sku },
      },
    })

    return NextResponse.json(
      { success: true, data: product, message: 'Product created successfully' },
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
