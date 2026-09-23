import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAuth } from '@/lib/auth/auth-helpers'
import { verifyToken } from '@/lib/auth/mfa'
import { decryptSecret } from '@/lib/auth/mfa-crypto'
import prisma from '@/lib/db/prisma'

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit number'),
})

function errStatus(message: string): number {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.startsWith('Conflict')) return 409
  return 400
}

// POST /api/auth/mfa/verify — any authenticated user. Verifies the first
// TOTP code and only then enables MFA for the account.
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireAuth()

    const body: unknown = await req.json()
    const data = verifySchema.parse(body)

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } })
    if (!user || !user.isActive) throw new Error('Unauthorized')
    if (user.mfaEnabled) throw new Error('Conflict: MFA is already enabled')
    if (!user.totpSecret) throw new Error('Unauthorized')

    let secret: string
    try {
      secret = decryptSecret(user.totpSecret)
    } catch {
      throw new Error('Unauthorized')
    }

    if (!verifyToken(data.code, secret)) {
      return NextResponse.json(
        { success: false, error: { code: 'ERROR', message: 'Invalid authentication code' } },
        { status: 401 }
      )
    }

    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } })

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'MFA_ENABLED', entity: 'User', entityId: user.id },
    })

    return NextResponse.json({ success: true, data: { mfaEnabled: true } })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: err.errors[0]?.message ?? 'Invalid input',
            issues: err.flatten(),
          },
        },
        { status: 400 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message } },
      { status: errStatus(message) }
    )
  }
}
