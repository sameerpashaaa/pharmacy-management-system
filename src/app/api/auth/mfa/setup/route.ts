import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth/auth-helpers'
import { generateOtpauthUrl, generateQrDataUrl, generateSecret } from '@/lib/auth/mfa'
import { encryptSecret } from '@/lib/auth/mfa-crypto'
import prisma from '@/lib/db/prisma'

function errStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Conflict')) return 409
  return 500
}

// POST /api/auth/mfa/setup — any authenticated user. Generates a TOTP secret,
// stores it encrypted with mfaEnabled=false, and returns QR provisioning data.
// The raw secret is never returned.
export async function POST() {
  try {
    const sessionUser = await requireAuth()

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } })
    if (!user || !user.isActive) throw new Error('Unauthorized')
    if (user.mfaEnabled) throw new Error('Conflict: MFA is already enabled')

    const secret = generateSecret()
    const encrypted = encryptSecret(secret)

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encrypted, mfaEnabled: false },
    })

    const otpauthUrl = generateOtpauthUrl(user.email, secret)
    const qrDataUrl = await generateQrDataUrl(otpauthUrl)

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'MFA_SETUP', entity: 'User', entityId: user.id },
    })

    return NextResponse.json({ success: true, data: { otpauthUrl, qrDataUrl } }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
