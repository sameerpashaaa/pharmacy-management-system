import crypto from 'crypto'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import prisma from '@/lib/db/prisma'
import { sendPasswordResetEmail } from '@/lib/email/mailer'
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit'
import { forgotPasswordSchema } from '@/lib/validations/auth'

const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes
const HASH = 'sha256'

const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a password reset link has been sent.',
}

/**
 * POST /api/auth/forgot-password
 *
 * Always answers with a generic 200 so the endpoint cannot be used to
 * enumerate registered emails. Rate-limited per client IP.
 */
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(
      { scope: 'forgot-password', limit: 5, windowMs: 10 * 60 * 1000 },
      clientIp(req)
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } }
      )
    }

    const body: unknown = await req.json()
    const data = forgotPasswordSchema.parse(body)

    const user = await prisma.user.findUnique({ where: { email: data.email } })

    // Unknown / deactivated accounts get the same generic response — no
    // enumeration — and no mail is sent.
    if (user?.isActive) {
      const rawToken = crypto.randomBytes(32).toString('hex')
      const hashedToken = crypto.createHash(HASH).update(rawToken).digest('hex')

      // One live token at a time: invalidate any previous unused tokens.
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })

      await prisma.passwordResetToken.create({
        data: {
          token: hashedToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      })

      const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      await sendPasswordResetEmail(user.email, `${baseUrl}/reset-password?token=${rawToken}`)

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET_REQUESTED',
          entity: 'User',
          entityId: user.id,
        },
      })
    }

    return NextResponse.json({ success: true, data: GENERIC_RESPONSE })
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
    console.error('forgot-password error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    )
  }
}
