import type { Metadata } from 'next'
import Link from 'next/link'

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = { title: 'Reports & Analytics' }

const reports = [
  {
    title: 'Sales & Financial Reports',
    description: 'View daily revenue, tax, and discount breakdowns.',
    href: ROUTES.REPORTS_SALES,
  },
  {
    title: 'Inventory & Stock Position',
    description: 'View daily stock position, near-expiry, and consumption reports.',
    href: ROUTES.REPORTS_INVENTORY,
  },
  {
    title: 'Supplier Performance',
    description: 'Track supplier fulfillment rates and outstanding balances.',
    href: ROUTES.REPORTS_SUPPLIER,
  },
  {
    title: 'Narcotic Register',
    description: 'Audit log for Schedule X and H1 drugs.',
    href: ROUTES.REPORTS_NARCOTICS,
  },
]

export default function ReportsAnalyticsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
        <p className="text-muted-foreground">Comprehensive business intelligence and reporting</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
