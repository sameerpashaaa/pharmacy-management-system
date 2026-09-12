import type { Metadata } from 'next'
import Link from 'next/link'

import { ProductForm } from '@/components/products/product-form'
import { Button } from '@/components/ui/button'
import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'Add New Product' }

export default async function AddNewProductPage() {
  const canCreate = await can(PERMISSIONS.PRODUCTS_CREATE)

  if (!canCreate) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Product</h1>
          <p className="text-muted-foreground">Add a new product to the catalog</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to create products.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Product</h1>
          <p className="text-muted-foreground">Add a new product to the catalog</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PRODUCTS}>Back to Catalog</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <ProductForm />
      </div>
    </div>
  )
}
