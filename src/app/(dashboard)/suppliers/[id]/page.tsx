import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SupplierEditForm } from '@/components/suppliers/supplier-edit-form'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getSupplier } from '@/lib/purchases/purchase-service'

export const metadata: Metadata = { title: 'Edit Supplier' }

type Props = { params: { id: string } }

export default async function EditSupplierPage({ params }: Props) {
  const [canRead, canUpdate, session] = await Promise.all([
    can(PERMISSIONS.SUPPLIERS_READ),
    can(PERMISSIONS.SUPPLIERS_UPDATE),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">You do not have permission to view suppliers.</p>
      </div>
    )
  }

  // Read-only view still loads the supplier so admins without UPDATE can see details
  // (SUPPLIERS_READ includes detail access — suppliers are global in scope).
  const supplier = await getSupplier(params.id, session.user)
  if (!supplier) notFound()

  const initial = {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    gstin: supplier.gstin ?? '',
    pan: supplier.pan ?? '',
    dlNumber: supplier.dlNumber ?? '',
    address: supplier.address ?? '',
    city: supplier.city ?? '',
    state: supplier.state ?? '',
    pincode: supplier.pincode ?? '',
    bankName: supplier.bankName ?? '',
    bankAccount: supplier.bankAccount ?? '',
    bankIfsc: supplier.bankIfsc ?? '',
    creditDays: supplier.creditDays,
    notes: supplier.notes ?? '',
    isActive: supplier.isActive,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Supplier</h1>
          <p className="text-muted-foreground">{supplier.name}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.SUPPLIERS}>&larr; Back to suppliers</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-card p-6">
        {!canUpdate ? (
          <p className="text-sm text-muted-foreground">
            You have view-only access to this supplier. Ask an administrator to make changes.
          </p>
        ) : (
          <SupplierEditForm initial={initial} />
        )}
      </div>
    </div>
  )
}
