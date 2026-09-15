'use client'

// ─────────────────────────────────────────────────────────────
// Component — PurchaseReturnsView
// Complete overview dashboard for vendor purchase returns.
// ─────────────────────────────────────────────────────────────
import { Clock, Plus, Receipt, RotateCcw } from 'lucide-react'
import Link from 'next/link'

import {
  PurchaseReturnsTable,
  type PurchaseReturnRow,
} from '@/components/purchases/purchase-returns-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'

interface PurchaseReturnsViewProps {
  returns: PurchaseReturnRow[]
  stats: {
    totalReturns: number
    totalDebitAmount: number
    pendingReturnsCount: number
  }
  canCreate: boolean
}

export function PurchaseReturnsView({
  returns,
  stats,
  canCreate,
}: PurchaseReturnsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Returns (RTV)</h1>
          <p className="text-muted-foreground">
            Manage vendor product returns, stock reversals, and debit notes.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href={ROUTES.PURCHASE_RETURNS_NEW} className="gap-2">
              <Plus className="h-4 w-4" />
              New Purchase Return
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{stats.totalReturns}</div>
            <p className="text-xs text-muted-foreground">Returns to vendors logged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Debit Memo Amount</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(stats.totalDebitAmount)}
            </div>
            <p className="text-xs text-muted-foreground">Total debited to supplier ledgers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Dispatch</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {stats.pendingReturnsCount}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting vendor pickup/dispatch</p>
          </CardContent>
        </Card>
      </div>

      <PurchaseReturnsTable data={returns} />
    </div>
  )
}
