import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import prisma from '@/lib/db/prisma'

const createFileSchema = z.object({
  fileName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  url: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
})

// POST /api/files — create a File record (used for evidence attachments)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.INVENTORY_ADJUST)
    const body: unknown = await req.json()
    const data = createFileSchema.parse(body)

    const file = await prisma.file.create({
      data: {
        fileName: data.fileName,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        url: data.url,
        path: data.url,
        uploadedById: user.id,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
      },
    })

    return NextResponse.json({ success: true, data: file }, { status: 201 })
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
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
