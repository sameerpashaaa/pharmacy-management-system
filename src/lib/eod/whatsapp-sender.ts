// ─────────────────────────────────────────────────────────────
// WhatsApp Sender — Meta Cloud API
//
// Sends a plain text WhatsApp message via the official
// Meta Cloud API (graph.facebook.com).
// No external SDK required — uses native fetch.
//
// Meta Cloud API docs:
//   https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
// ─────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  /** Phone Number ID from Meta Developer Console */
  phoneNumberId: string
  /** Meta API access token (permanent or temp) */
  accessToken: string
  /** API version e.g. "v19.0" */
  apiVersion?: string
}

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Sends a plain text WhatsApp message to `to` (E.164 format, no + prefix for Meta API).
 * Strips leading + if present.
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  config: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const version = config.apiVersion ?? 'v19.0'
  const recipientNumber = to.replace(/^\+/, '').replace(/[\s\-().]/g, '')

  const url = `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientNumber,
    type: 'text',
    text: {
      preview_url: false,
      body,
    },
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { success: false, error: `Failed to reach Meta API: ${msg}` }
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok) {
    const errObj = json?.error as Record<string, unknown> | undefined
    const errMsg =
      typeof errObj?.message === 'string'
        ? errObj.message
        : `Meta API returned HTTP ${response.status}`
    return { success: false, error: errMsg }
  }

  // Extract message ID from response
  const messages = json?.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id

  return { success: true, messageId }
}
