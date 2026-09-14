import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'Receive Goods — GRN' }

type Props = { params: { id: string } }

export default function ReceiveGoodsPage({ params }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PURCHASE(params.id)}>&larr; Back to PO</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receive Goods — GRN</h1>
          <p className="text-muted-foreground">Record goods received against purchase order</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">GRN form — connect to POST /api/purchases/{params.id}/grn</p>
      </div>
    </div>
  )
}