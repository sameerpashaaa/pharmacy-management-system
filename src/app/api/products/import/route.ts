// ─────────────────────────────────────────────────────────────
// POST /api/products/import
// CSV import for bulk product creation. All-or-nothing: the entire
// file is validated first; if any row fails, nothing is written.
// ─────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { MAX_CSV_FILE_SIZE } from '@/lib/constants/product-import'
import { prisma } from '@/lib/db/prisma'
import { importProductsFromCsv } from '@/lib/products/product-import'

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_IMPORT)

    // --- File extraction ---
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: 'A CSV file upload is required (form field "file")',
          },
        },
        { status: 400 }
      )
    }

    // Early size guard so we never read a massive upload into memory.
    if (file.size > MAX_CSV_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: `CSV file exceeds the maximum size of ${Math.round(MAX_CSV_FILE_SIZE / 1024 / 1024)} MB`,
          },
        },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // --- Import ---
    const result = await importProductsFromCsv(
      { name: file.name, size: buffer.length, type: file.type, content: buffer },
      user.id
    )

    if (result.failed > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_FAILED',
            message: 'Import failed. No rows were inserted.',
            summary: result,
          },
        },
        { status: 400 }
      )
    }

    // --- Audit (single aggregate entry for the batch) ---
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entity: 'Product',
        entityId: null,
        newData: {
          method: 'csv-import',
          fileName: result.fileName,
          totalRows: result.totalRows,
          imported: result.imported,
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: `Imported ${result.imported} product${result.imported === 1 ? '' : 's'} successfully`,
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status =
      message === 'Unauthorized'
        ? 401
        : message.startsWith('Forbidden')
          ? 403
          : message.startsWith('Conflict')
            ? 409
            : message.startsWith('Validation')
              ? 400
              : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
