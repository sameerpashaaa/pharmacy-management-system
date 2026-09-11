import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Product Categories' }

export default function ProductCategoriesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
        <p className="text-muted-foreground">Manage product categories and sub-categories</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 2</p>
      </div>
    </div>
  )
}
