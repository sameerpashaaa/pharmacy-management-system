import type { Metadata } from 'next'

import { type CreditNoteRow } from '@/components/returns/credit-notes-table'
import { type SaleReturnRow } from '@/components/returns/sale-returns-table'
import { SaleReturnsView } from '@/components/returns/sale-returns-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { listCreditNotes, listSaleReturns } from '@/lib/returns/sale-return-service'

export const metadata: Metadata = { title: 'Sales Returns & Credit Notes' }

export default async function SalesReturnsPage() {
  const [canRead, canCreate, session] = await Promise.all([
    can(PERMISSIONS.RETURNS_READ),
    can(PERMISSIONS.RETURNS_CREATE),
    getSession(),
  ])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Returns & Credit Notes</h1>
          <p className="text-muted-foreground">Manage customer product returns and store credits</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view sales returns.</p>
        </div>
      </div>
    )
  }

  const scope = await resolveBranchScope(session.user)
  const actor = {
    id: session.user.id,
    branchId: scope,
    permissions: session.user.permissions ?? [],
  }

  const [returnsResult, creditNotesResult] = await Promise.all([
    listSaleReturns({ limit: 100 }, actor),
    listCreditNotes({ limit: 100 }, actor),
  ])

  const returnRows: SaleReturnRow[] = returnsResult.data.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    saleId: r.sale.id,
    invoiceNumber: r.sale.invoiceNumber,
    customerName: r.customer?.name ?? null,
    returnDate: r.returnDate.toISOString(),
    reason: r.reason,
    totalAmount: Number(r.totalAmount),
    status: r.status,
    refundMethod: r.refundMethod,
    itemsCount: r.items.length,
    hasCreditNote: Boolean(r.creditNote),
  }))

  const creditNoteRows: CreditNoteRow[] = creditNotesResult.data.map((cn) => {
    const amount = Number(cn.amount)
    const balanceUsed = Number(cn.balanceUsed)
    return {
      id: cn.id,
      noteNumber: cn.noteNumber,
      saleReturnId: cn.saleReturn.id,
      returnNumber: cn.saleReturn.returnNumber,
      invoiceNumber: cn.saleReturn.sale.invoiceNumber,
      customerName: cn.customer?.name ?? null,
      amount,
      balanceUsed,
      availableBalance: Math.max(0, amount - balanceUsed),
      status: cn.status,
      expiresAt: cn.expiresAt ? cn.expiresAt.toISOString() : null,
      createdAt: cn.createdAt.toISOString(),
    }
  })

  // Compute summary stats
  const totalReturns = returnRows.length
  const totalRefundAmount = returnRows.reduce((sum, r) => sum + r.totalAmount, 0)
  const activeCreditNotes = creditNoteRows.filter(
    (cn) => cn.status === 'ACTIVE' || cn.status === 'PARTIALLY_USED'
  )
  const activeCreditNotesCount = activeCreditNotes.length
  const activeCreditBalance = activeCreditNotes.reduce((sum, cn) => sum + cn.availableBalance, 0)

  return (
    <SaleReturnsView
      returns={returnRows}
      creditNotes={creditNoteRows}
      stats={{
        totalReturns,
        totalRefundAmount,
        activeCreditNotesCount,
        activeCreditBalance,
      }}
      canCreate={canCreate}
    />
  )
}
