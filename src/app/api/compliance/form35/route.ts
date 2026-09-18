import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { requirePermission } from '@/lib/auth/auth-helpers'
import { getScheduleH1Register } from '@/lib/compliance/schedule-h1-service'
import { PERMISSIONS } from '@/lib/constants/permissions'

const form35QuerySchema = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

// GET /api/compliance/form35?startDate=&endDate= — Form 35 Schedule H1 PDF export
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_EXPORT)

    const query = form35QuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    const startDate =
      query.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = query.endDate ?? new Date().toISOString()

    const { data } = await getScheduleH1Register({
      startDate,
      endDate,
      limit: 10000,
    })

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('FORM 35 - Schedule H1 Register', 14, 15)
    doc.setFontSize(10)
    doc.text(
      `Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
      14,
      22
    )

    const tableData = data.map((entry) => [
      new Date(entry.dispensedDate).toLocaleDateString(),
      entry.patientName,
      entry.doctorName,
      entry.medicineName,
      entry.batchNumber,
      entry.quantityGiven.toString(),
    ])

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Patient Name', 'Prescribing Doctor', 'Medicine', 'Batch', 'Qty']],
      body: tableData,
    })

    const pdfOutput = doc.output('arraybuffer')

    return new NextResponse(pdfOutput, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="form-35-register.pdf"',
      },
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
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ success: false, error: { code: 'ERROR', message } }, { status })
  }
}
