import nodemailer from 'nodemailer'

/**
 * Mailer with a development fallback.
 *
 * Configure real delivery with the standard SMTP env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 *
 * When SMTP_HOST is not set (local dev / CI), messages are logged to the
 * server console instead of being sent, so the full password-reset flow can
 * be exercised end-to-end without a mail server.
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

function createTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

export async function sendMail(message: MailMessage): Promise<void> {
  const transport = createTransport()

  if (!transport) {
    // Dev fallback — surfaced in the server log rather than delivered.
    // eslint-disable-next-line no-console
    console.warn('\n================ MAIL (dev fallback) ================')
    // eslint-disable-next-line no-console
    console.warn(`To:      ${message.to}`)
    // eslint-disable-next-line no-console
    console.warn(`Subject: ${message.subject}`)
    // eslint-disable-next-line no-console
    console.warn(message.text)
    // eslint-disable-next-line no-console
    console.warn('=====================================================\n')
    return
  }

  await transport.sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

/** Send a password reset link. Extracted so the copy has a single home. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: 'Reset your Pharmacy Management System password',
    text: [
      'You requested a password reset.',
      '',
      `Reset link (valid for 30 minutes): ${resetUrl}`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a>
         (link valid for 30 minutes).</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  })
}
