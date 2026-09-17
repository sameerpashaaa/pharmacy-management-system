'use server'

import { revalidatePath } from 'next/cache'

import { getSession } from '@/lib/auth/auth-helpers'
import { cancelSale } from '@/lib/sales/sales-service'

export async function cancelSaleAction(saleId: string, reason: string) {
  const session = await getSession()
  if (!session?.user) throw new Error('Unauthorized')

  await cancelSale(saleId, reason, {
    id: session.user.id,
    branchId: session.user.branchId,
    permissions: session.user.permissions,
  })

  revalidatePath(`/sales/${saleId}`)
  revalidatePath('/sales')
}
