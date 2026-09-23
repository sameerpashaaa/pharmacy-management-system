import crypto from 'crypto'

import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { isPasswordReused, recordPasswordHistory } from '@/lib/auth/password-history'
import prisma from '@/lib/db/prisma'
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit'
import { resetPasswordSchema } from '@/lib/validations/auth'

/**
 * POST /api/auth/reset-password
 *
 * Consumes a reset token (stored hashed) and sets a new password. The token
 * is single-use and expires after 30 minutes. Resets lockout state and
 * clears mustChangePassword. Rate-limited per client IP.
 */
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(
      { scope: 'reset-password', limit: 10, windowMs: 10 * 60 * 1000 },
      clientIp(req)
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } }
      )
    }

    const body: unknown = await req.json()
    const data = resetPasswordSchema.parse(body)

    const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex')
    const token = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    })

    // Same message for every failure mode — never reveal whether a token
    // exists / which property was wrong.
    const invalidError = () =>
      NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'This reset link is invalid or has expired.' },
        },
        { status: 400 }
      )

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      return invalidError()
    }

    const user = await prisma.user.findUnique({ where: { id: token.userId } })
    if (!user || !user.isActive) {
      return invalidError()
    }

    if (await isPasswordReused(user.id, data.password)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PASSWORD_REUSED',
            message: 'This password was used recently. Please choose a different one.',
          },
        },
        { status: 409 }
      )
    }

    const hash = await bcrypt.hash(data.password, 10)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      })
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      })
      await recordPasswordHistory(tx, user.id, hash)
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET_COMPLETED',
          entity: 'User',
          entityId: user.id,
        },
      })
    })

    return NextResponse.json({
      success: true,
      data: { message: 'Your password has been reset. You can now sign in with it.' },
    })
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
    console.error('reset-password error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    )
  }
}
