import type { Metadata } from 'next'

import { ProductCatalog } from '@/components/products/product-catalog'
import type { ProductRow } from '@/components/products/product-table'
import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getProducts } from '@/lib/products/product-service'

export const metadata: Metadata = { title: 'Product Catalog' }

export default async function ProductCatalogPage() {
  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    can(PERMISSIONS.PRODUCTS_READ),
    can(PERMISSIONS.PRODUCTS_CREATE),
    can(PERMISSIONS.PRODUCTS_UPDATE),
    can(PERMISSIONS.PRODUCTS_DELETE),
  ])

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Catalog</h1>
          <p className="text-muted-foreground">
            Manage your pharmaceutical product master database
          </p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view products.</p>
        </div>
      </div>
    )
  }

  const firstPage = await getProducts({ page: 1, limit: 20 })

  const initialProducts: ProductRow[] = firstPage.data.map((p) => ({
    id: p.id,
    name: p.name,
    genericName: p.genericName,
    sku: p.sku,
    barcode: p.barcode,
    manufacturer: p.manufacturer,
    mrp: p.mrp.toString(),
    unitOfMeasure: p.unitOfMeasure,
    isActive: p.isActive,
    isPrescriptionRequired: p.isPrescriptionRequired,
    drugSchedule: p.drugSchedule,
    hsnCode: p.hsnCode,
    createdAt: p.createdAt,
    categories: p.categories.map((c) => ({
      category: { id: c.category.id, name: c.category.name },
    })),
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Product Catalog</h1>
        <p className="text-muted-foreground">Manage your pharmaceutical product master database</p>
      </div>
      <ProductCatalog
        initialProducts={initialProducts}
        initialPagination={firstPage.pagination}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  )
}
