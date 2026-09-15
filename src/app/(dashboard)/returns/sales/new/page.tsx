import type { Metadata } from 'next'

import { type SaleFormData, SaleReturnForm } from '@/components/returns/sale-return-form'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { resolveBranchScope } from '@/lib/inventory/branch-access'
import { getSaleById } from '@/lib/sales/sales-service'

export const metadata: Metadata = { title: 'Process Sales Return' }

interface NewSalesReturnPageProps {
  searchParams: {
    saleId?: string
  }
}

export default async function NewSalesReturnPage({
  searchParams,
}: NewSalesReturnPageProps) {
  const [canCreate, session] = await Promise.all([
    can(PERMISSIONS.RETURNS_CREATE),
    getSession(),
  ])

  if (!canCreate || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Process Sales Return</h1>
          <p className="text-muted-foreground">You do not have permission to process sales returns.</p>
        </div>
      </div>
    )
  }

  const scope = await resolveBranchScope(session.user)

  let initialSale: SaleFormData | null = null

  if (searchParams.saleId) {
    try {
      const sale = await getSaleById(searchParams.saleId, scope)
      if (sale) {
        initialSale = {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          branchId: sale.branchId,
          saleDate: sale.saleDate.toISOString(),
          totalAmount: Number(sale.totalAmount),
          status: sale.status,
          customer: sale.customer
            ? {
                id: sale.customer.id,
                name: sale.customer.name,
                phone: sale.customer.phone,
              }
            : null,
          items: sale.items.map((item) => ({
            id: item.id,
            productName: item.productName,
            productSku: item.productSku,
            quantity: item.quantity,
            returnedQuantity: item.returnedQuantity ?? 0,
            unitPrice: Number(item.unitPrice),
            totalAmount: Number(item.totalAmount),
            itemBatches: item.itemBatches.map((ib) => ({
              batchId: ib.batch.id,
              batch: {
                id: ib.batch.id,
                batchNumber: ib.batch.batchNumber,
              },
            })),
          })),
        }
      }
    } catch {
      // If saleId was invalid or not found, fall back to manual search
      initialSale = null
    }
  }

  return <SaleReturnForm initialSale={initialSale} />
}
