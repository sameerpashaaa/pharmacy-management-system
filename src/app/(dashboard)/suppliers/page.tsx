import type { Metadata } from 'next'

import type { SupplierRow } from '@/components/suppliers/suppliers-table'
import { SuppliersView } from '@/components/suppliers/suppliers-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listSuppliers } from '@/lib/purchases/purchase-service'
import { supplierListQuerySchema } from '@/lib/validations/purchase'

export const metadata: Metadata = { title: 'Suppliers' }

export default async function SuppliersPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.SUPPLIERS_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage supplier database and payables</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view suppliers.</p>
        </div>
      </div>
    )
  }

  const defaultQuery = supplierListQuerySchema.parse({ page: 1, limit: 20 })
  const firstPage = await listSuppliers(defaultQuery, session.user)


  const initialRows: SupplierRow[] = firstPage.data.map((s) => ({
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    creditDays: s.creditDays,
    outstandingBalance: s.outstandingBalance.toString(),
    isActive: s.isActive,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
        <p className="text-muted-foreground">Manage supplier database and payable tracking</p>
      </div>
      <SuppliersView initialRows={initialRows} initialPagination={firstPage.pagination} />
    </div>
  )
}