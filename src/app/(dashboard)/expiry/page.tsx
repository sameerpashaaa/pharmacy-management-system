import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { getExpirySummary } from '@/lib/batches/expiry-service'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Expiry Management' }

export default async function ExpiryManagementPage() {
  const [canRead, session] = await Promise.all([can(PERMISSIONS.BATCHES_READ), getSession()])
  const defaultBranchId = session?.user?.branchId ?? null

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expiry Management</h1>
          <p className="text-muted-foreground">
            Proactive expiry tracking, alerts, and disposal management
          </p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">You do not have permission to view batches.</p>
        </div>
      </div>
    )
  }

  const summary = await getExpirySummary(defaultBranchId ?? undefined)

  const tiles: {
    href: string
    title: string
    description: string
    value: number
    badge: string
    badgeClassName: string
  }[] = [
    {
      href: ROUTES.EXPIRY_EXPIRING,
      title: 'Critical',
      description: 'Expiring within 30 days — prioritize prompt action.',
      value: summary.critical,
      badge: 'CRITICAL',
      badgeClassName: '',
    },
    {
      href: ROUTES.EXPIRY_EXPIRING,
      title: 'Warning',
      description: 'Expiring within 60 days.',
      value: summary.warning,
      badge: 'WARNING',
      badgeClassName: 'bg-amber-500 text-white',
    },
    {
      href: ROUTES.EXPIRY_EXPIRING,
      title: 'Info',
      description: 'Expiring within 90 days.',
      value: summary.info,
      badge: 'INFO',
      badgeClassName: '',
    },
    {
      href: ROUTES.EXPIRY_EXPIRED,
      title: 'Expired',
      description: 'EXPIRED batches blocked from dispensing and awaiting disposal.',
      value: summary.expired,
      badge: 'EXPIRED',
      badgeClassName: '',
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expiry Management</h1>
        <p className="text-muted-foreground">
          Proactive expiry tracking, alerts, and disposal management — 90 days window.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.title} href={tile.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader className="pb-3">
                <CardDescription>{tile.description}</CardDescription>
                <CardTitle className="flex items-center justify-between">
                  {tile.value}
                  <Badge className={cn(tile.badgeClassName)} variant="outline">
                    {tile.badge}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium">{tile.title}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">≤ 30 days · Critical</Badge>
        <Badge variant="warning">≤ 60 days · Warning</Badge>
        <Badge variant="secondary">≤ 90 days · Info</Badge>
        <Badge variant="outline">Expired · Blocked from dispensing</Badge>
      </div>
    </div>
  )
}
