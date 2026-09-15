import type { Metadata } from 'next'

import { PrescriptionForm } from '@/components/prescriptions/prescription-form'
import { can, getSession } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { getAccessibleBranches } from '@/lib/inventory/branch-access'

export const metadata: Metadata = { title: 'Register Prescription' }

export default async function NewPrescriptionPage() {
  const [canCreate, session] = await Promise.all([
    can(PERMISSIONS.PRESCRIPTIONS_CREATE),
    getSession(),
  ])

  if (!canCreate || !session?.user) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Register Prescription</h1>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">
            You do not have permission to register prescriptions.
          </p>
        </div>
      </div>
    )
  }

  const branches = await getAccessibleBranches(session.user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Register Prescription</h1>
        <p className="text-muted-foreground">
          Enter prescription details and attach scans for verification
        </p>
      </div>

      <PrescriptionForm
        branches={branches}
        defaultBranchId={session.user.branchId ?? undefined}
      />
    </div>
  )
}
