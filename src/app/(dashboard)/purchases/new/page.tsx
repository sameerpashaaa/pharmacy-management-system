import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'New Purchase Order' }

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PURCHASES}>&larr; Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Purchase Order</h1>
          <p className="text-muted-foreground">Create a new purchase order for a supplier</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Purchase order form — coming soon in Phase 4 UI</p>
      </div>
    </div>
  )
}