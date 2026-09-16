import type { Metadata } from 'next'

import { CategoryManager } from '@/components/categories/category-manager'
import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'Product Categories' }

export default async function ProductCategoriesPage() {
  const canRead = await can(PERMISSIONS.CATEGORIES_MANAGE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
        <p className="text-muted-foreground">Manage product categories and sub-categories</p>
      </div>
      {canRead ? (
        <CategoryManager />
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view categories.</p>
        </div>
      )}
    </div>
  )
}
