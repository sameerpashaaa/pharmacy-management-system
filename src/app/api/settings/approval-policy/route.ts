import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'
import { getApprovalPolicy, validateApprovalPolicy } from '@/lib/settings/settings-service'

const approvalPolicySchema = z
  .object({
    selfMax: z.number().int().min(0, 'selfMax must be >= 0'),
    managerMax: z.number().int(),
  })
  .refine((d) => d.managerMax > d.selfMax, {
    message: 'managerMax must be > selfMax',
    path: ['managerMax'],
  })

// GET /api/settings/approval-policy
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_READ)
    const policy = await getApprovalPolicy()
    return NextResponse.json({
      success: true,
      data: {
        selfMax: policy.selfMax,
        managerMax: policy.managerMax,
        preview: {
          pharmacist: `0–${policy.selfMax}`,
          manager: `${policy.selfMax + 1}–${policy.managerMax}`,
          chief: `${policy.managerMax + 1}+`,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}

// PUT /api/settings/approval-policy
export async function PUT(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    const body: unknown = await req.json()
    const data = approvalPolicySchema.parse(body)

    const validationError = validateApprovalPolicy(data.selfMax, data.managerMax)
    if (validationError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: validationError } },
        { status: 400 }
      )
    }

    const previous = await getApprovalPolicy()

    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { category_key: { category: 'inventory', key: 'approval_tier_self_max' } },
        update: { value: String(data.selfMax), dataType: 'number' },
        create: {
          category: 'inventory',
          key: 'approval_tier_self_max',
          value: String(data.selfMax),
          dataType: 'number',
          label: 'Self Approval Max Quantity',
        },
      })
      await tx.systemSetting.upsert({
        where: { category_key: { category: 'inventory', key: 'approval_tier_manager_max' } },
        update: { value: String(data.managerMax), dataType: 'number' },
        create: {
          category: 'inventory',
          key: 'approval_tier_manager_max',
          value: String(data.managerMax),
          dataType: 'number',
          label: 'Manager Approval Max Quantity',
        },
      })
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'SystemSetting',
        entityId: 'inventory.approval_tier',
        oldData: previous as unknown as Prisma.InputJsonValue,
        newData: {
          selfMax: data.selfMax,
          managerMax: data.managerMax,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      success: true,
      data: { selfMax: data.selfMax, managerMax: data.managerMax },
      message: 'Approval policy updated',
    })
  } catch (err) {
    if (err instanceof ZodError) {
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
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.startsWith('Validation')
            ? 400
            : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
