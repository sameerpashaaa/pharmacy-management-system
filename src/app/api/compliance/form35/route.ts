import { NextRequest, NextResponse } from 'next/server'
import { getScheduleH1Register } from '@/lib/compliance/schedule-h1-service'
import { jsPDF } from 'jspdf'
// @ts-ignore
import autoTable from 'jspdf-autotable'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const endDate = searchParams.get('endDate') || new Date().toISOString()

  try {
    const { data } = await getScheduleH1Register({
      startDate,
      endDate,
      limit: 10000,
    })

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('FORM 35 - Schedule H1 Register', 14, 15)
    doc.setFontSize(10)
    doc.text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, 14, 22)

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
