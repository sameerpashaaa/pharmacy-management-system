import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'New Supplier' }

export default function NewSupplierPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.SUPPLIERS}>&larr; Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Supplier</h1>
          <p className="text-muted-foreground">Add a new supplier to your database</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Supplier form — API ready at POST /api/suppliers</p>
      </div>
    </div>
  )
}