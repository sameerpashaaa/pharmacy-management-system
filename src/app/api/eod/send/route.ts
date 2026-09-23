// ─────────────────────────────────────────────────────────────
// EOD API Route — /api/eod/send
//
// Triggers the end-of-day WhatsApp report.
// Called by the local node-cron scheduler at 8:00 PM IST.
// Can also be called manually (Postman / Settings UI test button).
//
// Security: validates Authorization: Bearer <EOD_REPORT_SECRET>
// ─────────────────────────────────────────────────────────────
/* eslint-disable no-console */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { formatEodMessage } from '@/lib/eod/eod-formatter'
import { getEodReportData } from '@/lib/eod/eod-service'
import { sendWhatsAppMessage } from '@/lib/eod/whatsapp-sender'

const EOD_SECRET = process.env.EOD_REPORT_SECRET

/**
 * Reads WhatsApp config from organization_settings table.
 */
async function getWhatsAppConfig(organizationId: string) {
  const rows = await prisma.organizationSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          'whatsapp.phone_number_id',
          'whatsapp.access_token',
          'whatsapp.api_version',
          'whatsapp.eod_enabled',
          'whatsapp.owner_phone',
        ],
      },
    },
  })

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  return {
    phoneNumberId: map['whatsapp.phone_number_id'] ?? '',
    accessToken: map['whatsapp.access_token'] ?? '',
    apiVersion: map['whatsapp.api_version'] ?? 'v19.0',
    eodEnabled: map['whatsapp.eod_enabled'] !== 'false',
    ownerPhone: map['whatsapp.owner_phone'] ?? '',
  }
}

// POST /api/eod/send
export async function POST(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const isSecretValid = Boolean(EOD_SECRET && token && token === EOD_SECRET)
  const isUserAllowed = await can(PERMISSIONS.SETTINGS_MANAGE).catch(() => false)

  if (!isSecretValid && !isUserAllowed) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized — requires valid EOD secret or admin session' },
      { status: 401 }
    )
  }

  try {
    // ── Load organization ────────────────────────────────────────
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, phone: true },
    })

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'No organization found. Run the database seed first.' },
        { status: 404 }
      )
    }

    // ── Check WhatsApp config ───────────────────────────────────
    const config = await getWhatsAppConfig(org.id)

    // Optional overrides from request body (e.g. from UI test button)
    let bodyData: Record<string, string> = {}
    try {
      bodyData = (await req.json()) as Record<string, string>
    } catch {
      // Body may be empty
    }

    const phoneNumberId =
      bodyData.phoneNumberId?.trim() ||
      config.phoneNumberId ||
      process.env.META_WA_PHONE_NUMBER_ID ||
      ''
    const accessToken =
      bodyData.accessToken?.trim() || config.accessToken || process.env.META_WA_ACCESS_TOKEN || ''
    const apiVersion = bodyData.apiVersion?.trim() || config.apiVersion || 'v19.0'
    const recipientPhone = bodyData.ownerPhone?.trim() || config.ownerPhone || org.phone || ''

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            'WhatsApp not configured. Go to Settings → WhatsApp Integration and fill in your Meta credentials.',
        },
        { status: 422 }
      )
    }

    if (!recipientPhone) {
      return NextResponse.json(
        {
          success: false,
          error: 'Owner phone number not set. Enter it in Settings → WhatsApp Integration.',
        },
        { status: 422 }
      )
    }

    // ── Gather data ──────────────────────────────────────────────
    const data = await getEodReportData(new Date())

    // ── Format message ───────────────────────────────────────────
    const message = formatEodMessage(data)

    // ── Send via Meta Cloud API ──────────────────────────────────
    const result = await sendWhatsAppMessage(recipientPhone, message, {
      phoneNumberId,
      accessToken,
      apiVersion,
    })

    if (!result.success) {
      console.error('[EOD] WhatsApp send failed:', result.error)
      return NextResponse.json(
        { success: false, error: result.error ?? 'Failed to send WhatsApp message' },
        { status: 502 }
      )
    }

    console.log(
      `[EOD] Report sent successfully to ${recipientPhone}. Message ID: ${result.messageId}`
    )

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      recipient: recipientPhone,
      preview: message,
      sentAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[EOD] Unexpected error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// GET /api/eod/send — preview only (no message sent)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const isSecretValid = Boolean(EOD_SECRET && token && token === EOD_SECRET)
  const isUserAllowed = await can(PERMISSIONS.SETTINGS_MANAGE).catch(() => false)

  if (!isSecretValid && !isUserAllowed) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await getEodReportData(new Date())
    const preview = formatEodMessage(data)
    return NextResponse.json({ success: true, preview, data })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
