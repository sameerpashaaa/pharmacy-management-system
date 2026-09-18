import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'System Settings' }

import { ApprovalPolicyForm } from '@/components/settings/approval-policy-form'
import { MfaEnrollmentCard } from '@/components/settings/mfa-enrollment-card'

export default function SystemSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Configure system-wide settings and preferences</p>
      </div>
      <ApprovalPolicyForm />
      <MfaEnrollmentCard />
    </div>
  )
}
