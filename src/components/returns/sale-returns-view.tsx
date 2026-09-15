'use client'

// ─────────────────────────────────────────────────────────────
// Component — SaleReturnsView
// Complete overview dashboard for sales returns and credit notes.
// ─────────────────────────────────────────────────────────────
import { ArrowDownLeft, CreditCard, Plus, Receipt, RotateCcw } from 'lucide-react'
import Link from 'next/link'

import { CreditNotesTable, type CreditNoteRow } from '@/components/returns/credit-notes-table'
import { SaleReturnsTable, type SaleReturnRow } from '@/components/returns/sale-returns-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ROUTES } from '@/lib/constants/routes'
import { formatCurrency } from '@/lib/utils/currency'

interface SaleReturnsViewProps {
  returns: SaleReturnRow[]
  creditNotes: CreditNoteRow[]
  stats: {
    totalReturns: number
    totalRefundAmount: number
    activeCreditNotesCount: number
    activeCreditBalance: number
  }
  canCreate: boolean
}

export function SaleReturnsView({
  returns,
  creditNotes,
  stats,
  canCreate,
}: SaleReturnsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Returns & Credit Notes</h1>
          <p className="text-muted-foreground">
            Manage customer product returns, inventory restock decisions, and store credits.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href={ROUTES.SALE_RETURNS_NEW} className="gap-2">
              <Plus className="h-4 w-4" />
              New Return
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{stats.totalReturns}</div>
            <p className="text-xs text-muted-foreground">Processed return orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Refunded Amount</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(stats.totalRefundAmount)}
            </div>
            <p className="text-xs text-muted-foreground">Total value refunded or credited</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Credit Notes</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {stats.activeCreditNotesCount}
            </div>
            <p className="text-xs text-muted-foreground">Unredeemed store credits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Store Credit</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
              {formatCurrency(stats.activeCreditBalance)}
            </div>
            <p className="text-xs text-muted-foreground">Outstanding customer credit</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="returns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="returns">
            Sales Returns ({returns.length})
          </TabsTrigger>
          <TabsTrigger value="credit-notes">
            Credit Notes ({creditNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="returns" className="space-y-4">
          <SaleReturnsTable data={returns} />
        </TabsContent>

        <TabsContent value="credit-notes" className="space-y-4">
          <CreditNotesTable data={creditNotes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
