import type { Metadata } from 'next'

import { WhatsAppSettingsForm } from '@/components/settings/whatsapp-settings-form'
import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'

export const metadata: Metadata = { title: 'WhatsApp Integration' }

export const dynamic = 'force-dynamic'

export default async function WhatsAppSettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Integration</h1>
        <p className="text-muted-foreground">
          Configure the Meta Cloud API to receive daily End-of-Day reports on WhatsApp at 8:00 PM
          IST
        </p>
      </div>
      <WhatsAppSettingsForm />
    </div>
  )
}
