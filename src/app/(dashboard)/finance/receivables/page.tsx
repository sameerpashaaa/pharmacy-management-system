import type { Metadata } from 'next'

import { PartyBalancesView, type PartyBalanceRow } from '@/components/finance/party-balances-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { listReceivables } from '@/lib/finance/finance-service'
import { partyLedgerQuerySchema } from '@/lib/validations/finance'

export const metadata: Metadata = { title: 'Receivables' }

export default async function ReceivablesPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.FINANCE_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receivables</h1>
          <p className="text-muted-foreground">Customer outstanding balances and dues</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view receivables.</p>
        </div>
      </div>
    )
  }

  const result = await listReceivables(partyLedgerQuerySchema.parse({ limit: 100 }))
  const rows: PartyBalanceRow[] = result.data.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    city: customer.city,
    outstandingBalance: Number(customer.outstandingBalance),
    creditDays: customer.creditDays,
    isActive: customer.isActive,
  }))

  return (
    <PartyBalancesView
      title="Receivables"
      description="Customer outstanding balances and collection exposure."
      balanceLabel="Customer Balances"
      rows={rows}
    />
  )
}
