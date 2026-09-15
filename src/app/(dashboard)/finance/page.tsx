import type { Metadata } from 'next'

import { FinanceOverview, type LedgerRow } from '@/components/finance/finance-overview'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getFinanceSummary, listLedgers } from '@/lib/finance/finance-service'
import { financeDateRangeSchema, ledgerListQuerySchema } from '@/lib/validations/finance'

export const metadata: Metadata = { title: 'Financial Management' }

export default async function FinancialManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.FINANCE_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Management</h1>
          <p className="text-muted-foreground">Track receivables, payables, and financial health</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">
            You do not have permission to view financial data.
          </p>
        </div>
      </div>
    )
  }

  const [summary, ledgersResult] = await Promise.all([
    getFinanceSummary(financeDateRangeSchema.parse({}), session.user),
    listLedgers(ledgerListQuerySchema.parse({ limit: 20 })),
  ])

  const ledgers: LedgerRow[] = ledgersResult.data.map((ledger) => ({
    id: ledger.id,
    code: ledger.code,
    name: ledger.name,
    type: ledger.type,
    balance: Number(ledger.balance),
    entriesCount: ledger._count.entries,
  }))

  return <FinanceOverview summary={summary} ledgers={ledgers} />
}
