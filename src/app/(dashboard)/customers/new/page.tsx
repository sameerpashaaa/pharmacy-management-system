import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CustomerForm } from '@/components/customers/customer-form'
import { Button } from '@/components/ui/button'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'New Customer' }

export default async function NewCustomerPage() {
  const [canCreate, session] = await Promise.all([can(PERMISSIONS.CUSTOMERS_CREATE), getSession()])

  if (!canCreate || !session?.user) {
    redirect(ROUTES.CUSTOMERS)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.CUSTOMERS}>&larr; Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Customer</h1>
          <p className="text-muted-foreground">Add a new customer to the database</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-lg border bg-card p-6 shadow-sm">
        <CustomerForm />
      </div>
    </div>
  )
}
