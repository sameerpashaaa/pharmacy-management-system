import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { CustomerForm } from '@/components/customers/customer-form'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getCustomer } from '@/lib/customers/customer-service'

export const metadata: Metadata = { title: 'Edit Customer' }

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const [canUpdate, session] = await Promise.all([can(PERMISSIONS.CUSTOMERS_UPDATE), getSession()])

  if (!canUpdate || !session?.user) {
    redirect(ROUTES.CUSTOMERS)
  }

  const customer = await getCustomer(params.id, session.user)
  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.CUSTOMERS}>&larr; Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Customer</h1>
          <p className="text-muted-foreground">Update customer details</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-lg border bg-card p-6 shadow-sm">
        <CustomerForm
          initialData={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            gstin: customer.gstin,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            pincode: customer.pincode,
            creditLimit: Number(customer.creditLimit),
            creditDays: customer.creditDays,
            isActive: customer.isActive,
            notes: customer.notes,
          }}
        />
      </div>
    </div>
  )
}
