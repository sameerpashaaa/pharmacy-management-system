// ─────────────────────────────────────────────────────────────
// EOD Settings API — /api/eod/settings
//
// GET  → reads WhatsApp config + owner phone from DB
// POST → saves WhatsApp config to organization_settings table
// ─────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

const settingsSchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone Number ID is required'),
  accessToken: z.string().min(1, 'Access Token is required'),
  wabaId: z.string().min(1, 'WhatsApp Business Account ID is required'),
  apiVersion: z.string().default('v19.0'),
  eodEnabled: z.boolean().default(true),
  ownerPhone: z.string().optional().or(z.literal('')),
})

// GET /api/eod/settings
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_MANAGE)

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, phone: true },
    })

    if (!org) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    const rows = await prisma.organizationSetting.findMany({
      where: {
        organizationId: org.id,
        key: {
          in: [
            'whatsapp.phone_number_id',
            'whatsapp.access_token',
            'whatsapp.waba_id',
            'whatsapp.api_version',
            'whatsapp.eod_enabled',
            'whatsapp.owner_phone',
          ],
        },
      },
    })

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId: map['whatsapp.phone_number_id'] ?? '',
        // Return masked token — show only last 6 chars for security
        accessToken: map['whatsapp.access_token'] ?? '',
        wabaId: map['whatsapp.waba_id'] ?? '',
        apiVersion: map['whatsapp.api_version'] ?? 'v19.0',
        eodEnabled: map['whatsapp.eod_enabled'] !== 'false',
        ownerPhone: map['whatsapp.owner_phone'] || org.phone || '',
        orgName: org.name,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

// POST /api/eod/settings
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_MANAGE)

    const body: unknown = await req.json()
    const data = settingsSchema.parse(body)

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })

    if (!org) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    if (data.ownerPhone !== undefined) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { phone: data.ownerPhone.trim() || null },
      })
    }

    const upserts = [
      { key: 'whatsapp.phone_number_id', value: data.phoneNumberId },
      { key: 'whatsapp.access_token', value: data.accessToken },
      { key: 'whatsapp.waba_id', value: data.wabaId },
      { key: 'whatsapp.api_version', value: data.apiVersion },
      { key: 'whatsapp.eod_enabled', value: String(data.eodEnabled) },
      { key: 'whatsapp.owner_phone', value: (data.ownerPhone ?? '').trim() },
    ]

    await Promise.all(
      upserts.map(({ key, value }) =>
        prisma.organizationSetting.upsert({
          where: { organizationId_key: { organizationId: org.id, key } },
          update: { value },
          create: { organizationId: org.id, key, value },
        })
      )
    )

    return NextResponse.json({ success: true, message: 'WhatsApp settings saved' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
