import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CustomerForm } from '@/components/customers/customer-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { can, requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getCustomer } from '@/lib/customers/customer-service'
import { formatCurrency } from '@/lib/utils/currency'

interface PageProps {
  params: { id: string }
}

export const metadata: Metadata = { title: 'Customer Detail' }

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({ params }: PageProps) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ)
  const customer = await getCustomer(params.id, user)
  if (!customer) notFound()

  const mayUpdate = await can(PERMISSIONS.CUSTOMERS_UPDATE)
  const outstandingPct =
    customer.creditLimit > 0
      ? Math.min(100, Math.round((customer.outstandingBalance / customer.creditLimit) * 100))
      : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/customers" className="inline-flex items-center hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Customers
        </Link>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Name</p>
            <p className="text-lg font-semibold">{customer.name}</p>
            {customer.gstin && (
              <p className="font-mono text-xs text-muted-foreground">GSTIN: {customer.gstin}</p>
            )}
            <div className="mt-1">
              <Badge variant={customer.customerType === 'WHOLESALE' ? 'default' : 'secondary'}>
                {customer.customerType === 'WHOLESALE' ? 'Wholesale / B2B' : 'Retail'}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Contact</p>
            <p className="text-sm">{customer.phone ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{customer.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Outstanding</p>
            <p className="text-sm font-semibold">{formatCurrency(customer.outstandingBalance)}</p>
            <p className="text-xs text-muted-foreground">
              of {formatCurrency(customer.creditLimit)} · {customer.creditDays}d
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Badge variant={customer.isActive ? 'success' : 'destructive'}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {customer.creditLimit > 0 && (
              <div className="w-full">
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className={`h-full ${
                      outstandingPct >= 100
                        ? 'bg-destructive'
                        : outstandingPct >= 75
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${outstandingPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{outstandingPct}% utilised</p>
              </div>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/finance/receivables">View Receivables</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {mayUpdate ? (
        <CustomerForm
          mode="edit"
          initial={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? undefined,
            email: customer.email ?? undefined,
            gstin: customer.gstin ?? undefined,
            address: customer.address ?? undefined,
            city: customer.city ?? undefined,
            state: customer.state ?? undefined,
            pincode: customer.pincode ?? undefined,
            creditLimit: customer.creditLimit,
            creditDays: customer.creditDays,
            customerType: customer.customerType,
            notes: customer.notes ?? undefined,
            isActive: customer.isActive,
          }}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You have read-only access to this customer.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
