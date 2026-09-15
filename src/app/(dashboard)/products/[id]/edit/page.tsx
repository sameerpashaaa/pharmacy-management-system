import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ProductForm } from '@/components/products/product-form'
import { Button } from '@/components/ui/button'
import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getProductById } from '@/lib/products/product-service'

export const metadata: Metadata = { title: 'Edit Product' }

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const canUpdate = await can(PERMISSIONS.PRODUCTS_UPDATE)
  if (!canUpdate) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">You do not have permission to edit products.</p>
      </div>
    )
  }

  const product = await getProductById(params.id)
  if (!product) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Product</h1>
          <p className="text-muted-foreground">{product.name}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PRODUCT(params.id)}>View Product</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <ProductForm
          successHref={ROUTES.PRODUCT(params.id)}
          initialData={{
            id: product.id,
            name: product.name,
            genericName: product.genericName,
            sku: product.sku,
            barcode: product.barcode,
            description: product.description,
            manufacturer: product.manufacturer,
            composition: product.composition,
            drugSchedule: product.drugSchedule,
            isPrescriptionRequired: product.isPrescriptionRequired,
            unitOfMeasure: product.unitOfMeasure,
            tabsPerStrip: product.tabsPerStrip,
            packSize: product.packSize,
            hsnCode: product.hsnCode,
            mrp: product.mrp.toString(),
            ptr: product.ptr?.toString(),
            costPrice: product.costPrice?.toString(),
            gstRate: product.gstRate.toString(),
            cgstRate: product.cgstRate.toString(),
            sgstRate: product.sgstRate.toString(),
            igstRate: product.igstRate.toString(),
            isGstExempt: product.isGstExempt,
            minStockLevel: product.minStockLevel,
            maxStockLevel: product.maxStockLevel,
            reorderLevel: product.reorderLevel,
            imageUrl: product.imageUrl,
            isActive: product.isActive,
            isReturnable: product.isReturnable,
            categories: product.categories,
            barcodes: product.barcodes.map((b) => ({ id: b.id, barcode: b.barcode, type: b.type })),
          }}
        />
      </div>
    </div>
  )
}
