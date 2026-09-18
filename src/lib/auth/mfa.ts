import { decode, encode, type JWT } from 'next-auth/jwt'
import QRCode from 'qrcode'

import { generateSecret, totp, verifyTotp } from './totp'

/** Short lifetime (seconds) for the intermediate MFA-pending credential. */
export const MFA_PENDING_MAX_AGE_SECONDS = 5 * 60

function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not configured')
  return secret
}

export { generateSecret, totp, verifyTotp }

export function verifyToken(token: string, secret: string): boolean {
  return verifyTotp(token, secret)
}

export function generateOtpauthUrl(email: string, secret: string, issuer = 'PharmaCare'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl)
}

/**
 * Creates a short-lived, signed MFA-pending credential. It carries only the
 * user id plus an mfaPending marker — never permissions, roles, or branch.
 */
export async function createMfaPendingToken(userId: string): Promise<string> {
  return encode({
    token: { sub: userId, mfaPending: true } as unknown as JWT,
    secret: getJwtSecret(),
    maxAge: MFA_PENDING_MAX_AGE_SECONDS,
  })
}

/** Returns the user id when the pending credential is valid, otherwise null. */
export async function verifyMfaPendingToken(mfaToken: string): Promise<string | null> {
  try {
    const decoded = await decode({ token: mfaToken, secret: getJwtSecret() })
    if (!decoded || decoded.mfaPending !== true || typeof decoded.sub !== 'string') return null
    return decoded.sub
  } catch {
    return null
  }
}
