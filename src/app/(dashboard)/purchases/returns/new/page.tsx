import type { Metadata } from 'next'

import {
  type PurchaseFormData,
  PurchaseReturnForm,
} from '@/components/purchases/purchase-return-form'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getPurchase } from '@/lib/purchases/purchase-service'

export const metadata: Metadata = { title: 'New Purchase Return' }

interface NewPurchaseReturnPageProps {
  searchParams: {
    purchaseId?: string
  }
}

export default async function NewPurchaseReturnPage({
  searchParams,
}: NewPurchaseReturnPageProps) {
  const [canCreate, session] = await Promise.all([
    can(PERMISSIONS.RETURNS_CREATE),
    getSession(),
  ])

  if (!canCreate || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Return to Vendor (RTV)</h1>
          <p className="text-muted-foreground">
            You do not have permission to create purchase returns.
          </p>
        </div>
      </div>
    )
  }

  let initialPurchase: PurchaseFormData | null = null

  if (searchParams.purchaseId) {
    try {
      const po = await getPurchase(searchParams.purchaseId, session.user)
      if (
        po &&
        ['RECEIVED', 'INVOICED', 'PARTIALLY_RECEIVED'].includes(po.status)
      ) {
        initialPurchase = {
          id: po.id,
          purchaseNumber: po.purchaseNumber,
          supplierId: po.supplierId,
          supplier: po.supplier,
          purchaseDate: po.purchaseDate.toISOString(),
          status: po.status,
          items: po.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productName: it.product.name,
            productSku: it.product.sku,
            receivedQuantity: it.receivedQuantity,
            unitCost: Number(it.unitCost),
            batchId: it.batchId,
          })),
        }
      }
    } catch {
      initialPurchase = null
    }
  }

  return <PurchaseReturnForm initialPurchase={initialPurchase} />
}
