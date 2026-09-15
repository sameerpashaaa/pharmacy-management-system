import type { Metadata } from 'next'

import { PartyBalancesView, type PartyBalanceRow } from '@/components/finance/party-balances-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listPayables } from '@/lib/finance/finance-service'
import { partyLedgerQuerySchema } from '@/lib/validations/finance'

export const metadata: Metadata = { title: 'Payables' }

export default async function PayablesPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.FINANCE_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payables</h1>
          <p className="text-muted-foreground">Supplier outstanding balances and dues</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view payables.</p>
        </div>
      </div>
    )
  }

  const result = await listPayables(partyLedgerQuerySchema.parse({ limit: 100 }))
  const rows: PartyBalanceRow[] = result.data.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    city: supplier.city,
    outstandingBalance: Number(supplier.outstandingBalance),
    creditDays: supplier.creditDays,
    isActive: supplier.isActive,
  }))

  return (
    <PartyBalancesView
      title="Payables"
      description="Supplier outstanding balances and upcoming payment exposure."
      balanceLabel="Supplier Balances"
      rows={rows}
      isSupplier={true}
    />
  )
}
