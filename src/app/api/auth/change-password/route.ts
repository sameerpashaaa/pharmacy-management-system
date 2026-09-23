import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAuth } from '@/lib/auth/auth-helpers'
import { isPasswordReused, recordPasswordHistory } from '@/lib/auth/password-history'
import prisma from '@/lib/db/prisma'
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit'
import { passwordSchema } from '@/lib/validations/user'

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

/**
 * POST /api/auth/change-password
 *
 * Authenticated self-service password change — required for accounts whose
 * session carries mustChangePassword=true (e.g. first login with an
 * admin-provisioned password). Clears the flag on success.
 */
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireAuth()

    const rate = checkRateLimit(
      { scope: 'change-password', limit: 10, windowMs: 10 * 60 * 1000 },
      `${clientIp(req)}:${sessionUser.id}`
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } }
      )
    }

    const body: unknown = await req.json()
    const data = changePasswordSchema.parse(body)

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } })
    if (!user || !user.isActive || !user.password) {
      throw new Error('Unauthorized')
    }

    if (!(await bcrypt.compare(data.currentPassword, user.password))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
        },
        { status: 400 }
      )
    }

    if (await bcrypt.compare(data.password, user.password)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PASSWORD_REUSED', message: 'New password must differ from the current one' },
        },
        { status: 409 }
      )
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
        data: { password: hash, mustChangePassword: false },
      })
      await recordPasswordHistory(tx, user.id, hash)
      await tx.auditLog.create({
        data: { userId: user.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user.id },
      })
    })

    return NextResponse.json({
      success: true,
      data: { message: 'Password changed successfully. Please sign in again with your new password.' },
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message } },
        { status: 401 }
      )
    }
    console.error('change-password error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    )
  }
}
