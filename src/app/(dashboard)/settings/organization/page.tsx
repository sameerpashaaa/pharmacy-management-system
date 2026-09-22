import type { Metadata } from 'next'

import { OrganizationForm } from '@/components/settings/organization-form'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getOrganizationWithBranches } from '@/lib/organization/org-service'

export const metadata: Metadata = { title: 'Organization Settings' }

export const dynamic = 'force-dynamic'

export default async function OrganizationSettingsPage() {
  const user = await requirePermission(PERMISSIONS.ORGANIZATION_READ)
  void user

  const org = await getOrganizationWithBranches()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">
          Business identity, tax registrations, locale and addresses
        </p>
      </div>
      {org ? (
        <OrganizationForm
          initial={{
            name: org.name ?? '',
            legalName: org.legalName ?? '',
            gstin: org.gstin ?? '',
            pan: org.pan ?? '',
            dlNumber: org.dlNumber ?? '',
            email: org.email ?? '',
            phone: org.phone ?? '',
            website: org.website ?? '',
            address: org.address ?? '',
            city: org.city ?? '',
            state: org.state ?? '',
            pincode: org.pincode ?? '',
            country: org.country ?? '',
            currency: org.currency ?? '',
            timezone: org.timezone ?? '',
            financialYearStart: org.financialYearStart ?? undefined,
          }}
        />
      ) : (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          No organization record found. Run the seed to bootstrap.
        </div>
      )}
    </div>
  )
}
