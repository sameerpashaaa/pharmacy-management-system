import type { Metadata } from 'next'

import { GstSummaryView } from '@/components/finance/gst-summary-view'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getGstSummary } from '@/lib/finance/finance-service'
import { gstReportQuerySchema } from '@/lib/validations/finance'

export const metadata: Metadata = { title: 'GST & Tax Management' }

export default async function GSTTaxManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.GST_READ), getSession()])

  if (!canRead || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GST & Tax Management</h1>
          <p className="text-muted-foreground">GST compliance, reporting, and tax configuration</p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view GST data.</p>
        </div>
      </div>
    )
  }

  const summary = await getGstSummary(gstReportQuerySchema.parse({}), session.user)
  return <GstSummaryView summary={summary} />
}
