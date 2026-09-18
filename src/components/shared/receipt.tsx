import { format } from 'date-fns'
import React from 'react'

export interface ReceiptProps {
  data: {
    receiptNo: string
    date: Date
    organization: {
      name: string
      logo?: string
      address?: string
      email?: string
      phone?: string
      gstin?: string
      dlNumber?: string
    }
    customer: {
      name: string
      address?: string
      email?: string
      phone?: string
      doctorName?: string
    }
    pharmacist: {
      name: string
      license?: string
      title?: string
    }
    items: Array<{
      code: string
      description: string
      batch?: string
      expiry?: string
      qty: number
      rate: number
      amount: number
      rack?: string
      hsn?: string
      mfg?: string
      sch?: string
      gstPercent?: number
    }>
    summary: {
      subtotal: number
      discount: number
      subtotalLessDiscount: number
      taxLabel?: string
      totalTax: number
      balanceDue: number
    }
    paymentMethod: string
    notes?: string
  }
}

function numberToWords(amount: number): string {
  const rupees = Math.floor(amount)
  if (rupees === 0) return 'Zero'

  const a = [
    '',
    'One ',
    'Two ',
    'Three ',
    'Four ',
    'Five ',
    'Six ',
    'Seven ',
    'Eight ',
    'Nine ',
    'Ten ',
    'Eleven ',
    'Twelve ',
    'Thirteen ',
    'Fourteen ',
    'Fifteen ',
    'Sixteen ',
    'Seventeen ',
    'Eighteen ',
    'Nineteen ',
  ]
  const b = [
    '',
    '',
    'Twenty ',
    'Thirty ',
    'Forty ',
    'Fifty ',
    'Sixty ',
    'Seventy ',
    'Eighty ',
    'Ninety ',
  ]

  const numStr = rupees.toString()
  if (numStr.length > 9) return 'Amount too large'

  const n = ('000000000' + numStr).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/)
  if (!n) return ''
  let str = ''
  str +=
    Number(n[1]) !== 0
      ? (a[Number(n[1])] || b[Number(n[1][0])] + a[Number(n[1][1])]) + 'Crore '
      : ''
  str +=
    Number(n[2]) !== 0 ? (a[Number(n[2])] || b[Number(n[2][0])] + a[Number(n[2][1])]) + 'Lakh ' : ''
  str +=
    Number(n[3]) !== 0
      ? (a[Number(n[3])] || b[Number(n[3][0])] + a[Number(n[3][1])]) + 'Thousand '
      : ''
  str +=
    Number(n[4]) !== 0
      ? (a[Number(n[4])] || b[Number(n[4][0])] + a[Number(n[4][1])]) + 'Hundred '
      : ''
  str +=
    Number(n[5]) !== 0
      ? (str !== '' ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + a[Number(n[5][1])])
      : ''

  return str.trim()
}

export function Receipt({ data }: ReceiptProps) {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col border border-black bg-white p-0 font-sans text-xs text-black print:w-full print:border print:border-black"
      style={{ minHeight: '200mm' }}
    >
      {/* Container with black borders */}

      <div className="grid grid-cols-[60%_40%] border-b border-black">
        <div className="border-r border-black p-2">
          {/* Left header */}
          <div className="mb-1 text-[16px] font-bold uppercase leading-tight text-blue-800">
            {data.organization.name}
          </div>
          <div>{data.organization.address}</div>
          <div>Phone : {data.organization.phone || '0000000000'}</div>
          <div>E-Mail : {data.organization.email || 'XXXXXXXX@gmail.com'}</div>
          <div>Dr. Name : {data.customer.doctorName || 'Mr.doctor'}</div>
          <div>Dr. Reg No. : {data.pharmacist.license || ''}</div>
        </div>
        <div className="p-2">
          {/* Right header */}
          <table className="text-xs">
            <tbody>
              <tr>
                <td className="w-[100px] align-top">Patient Name</td>
                <td className="whitespace-pre-wrap align-top">
                  : <strong>{data.customer.name}</strong>
                </td>
              </tr>
              <tr>
                <td className="align-top">Patient Address</td>
                <td className="whitespace-pre-wrap align-top">
                  : <strong>{data.customer.address || 'Hyderabad'}</strong>
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="h-4"></td>
              </tr>
              <tr>
                <td className="align-top">Mobile No.</td>
                <td className="align-top">
                  : <strong>{data.customer.phone || '9392974781'}</strong>
                </td>
              </tr>
              <tr>
                <td className="align-top">ABHA No.</td>
                <td className="align-top">
                  : <strong>-</strong>
                </td>
              </tr>
              <tr>
                <td className="align-top">ABHA Address</td>
                <td className="align-top">
                  : <strong>-</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub header row */}
      <div className="grid grid-cols-[35%_35%_30%] border-b border-black text-xs">
        <div className="flex flex-col justify-center border-r border-black p-2">
          <div>
            GSTIN : <strong>{data.organization.gstin || 'XXXXXXXXX'}</strong>
          </div>
          <div>
            DL.No. : <strong>{data.organization.dlNumber || 'XXXXXXXXXXXXX'}</strong>
          </div>
        </div>
        <div className="flex items-center justify-center border-r border-black p-2">
          <div className="border border-black px-4 py-1 text-lg font-bold">TAX INVOICE</div>
        </div>
        <div className="flex flex-col justify-center p-2">
          <div className="flex">
            <div className="w-[80px]">Invoice No.</div>
            <div>
              : <strong>{data.receiptNo}</strong>
            </div>
          </div>
          <div className="flex">
            <div className="w-[80px]">Date</div>
            <div>
              : <strong>{format(new Date(data.date), 'dd/MM/yyyy HH:mm')}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="flex flex-grow flex-col">
        <table className="h-full w-full border-collapse text-center text-xs">
          <thead className="h-8 bg-[#e0f7fa]">
            <tr>
              <th className="w-8 border-b border-r border-black py-1 font-bold">SN.</th>
              <th className="w-auto border-b border-r border-black px-2 py-1 text-left font-bold uppercase">
                PRODUCT NAME
              </th>
              <th className="w-12 border-b border-r border-black py-1 font-bold">RACK</th>
              <th className="w-16 border-b border-r border-black py-1 font-bold">HSN</th>
              <th className="w-12 border-b border-r border-black py-1 font-bold">MFG</th>
              <th className="w-12 border-b border-r border-black py-1 font-bold">SCH</th>
              <th className="w-20 border-b border-r border-black py-1 font-bold">BATCH</th>
              <th className="w-16 border-b border-r border-black py-1 font-bold">EXP</th>
              <th className="w-10 border-b border-r border-black py-1 font-bold">QTY</th>
              <th className="w-16 border-b border-r border-black px-2 py-1 text-right font-bold">
                RATE
              </th>
              <th className="w-12 border-b border-r border-black py-1 font-bold">GST%</th>
              <th className="w-20 border-b border-black px-2 py-1 text-right font-bold">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {data.items.map((item, i) => (
              <tr key={i}>
                <td className="border-r border-black py-1">{i + 1}.</td>
                <td className="border-r border-black px-2 py-1 text-left font-bold uppercase">
                  {item.description}
                </td>
                <td className="border-r border-black py-1">{item.rack || '-'}</td>
                <td className="border-r border-black py-1">{item.hsn || '-'}</td>
                <td className="border-r border-black py-1">{item.mfg || '-'}</td>
                <td className="border-r border-black py-1">{item.sch || '-'}</td>
                <td className="border-r border-black py-1">{item.batch || '-'}</td>
                <td className="border-r border-black py-1">{item.expiry || '-'}</td>
                <td className="border-r border-black py-1 font-bold">{item.qty}</td>
                <td className="border-r border-black px-2 py-1 text-right">
                  {item.rate.toFixed(2)}
                </td>
                <td className="border-r border-black py-1">{item.gstPercent || '0'}</td>
                <td className="px-2 py-1 text-right font-bold">{item.amount.toFixed(2)}</td>
              </tr>
            ))}
            {/* Empty row stretching to fill space */}
            <tr className="h-full">
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black px-2 py-1 text-left"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black py-1"></td>
              <td className="border-r border-black px-2 py-1 text-right"></td>
              <td className="border-r border-black py-1"></td>
              <td className="px-2 py-1 text-right"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="grid grid-cols-[75%_25%] border-t border-black">
        <div className="flex flex-col justify-between border-r border-black">
          <div className="p-1">
            GST {data.summary.totalTax.toFixed(2)} * 0% + 0% = 0.00 SGST + 0.00 CGST
          </div>
          <div className="flex-grow border-t border-black p-1 text-[11px]">
            <div className="mb-1 font-bold underline">Terms & Conditions</div>
            <div className="leading-tight">
              Exchange only within 1 month of purchase, bill must be produced.
              <br />
              Cutting strips and cold storage items will not be taken back.
              <br />
              Kindly show the medicines to the doctor before use.
              <br />
              We accept all major credit cards/Debit/UPI
              <br />
              <span className="font-bold">For Home Delivery: xxxxxxxxxx, xxxxxxxxxx</span>
            </div>
          </div>

          <div className="mt-2 p-1 text-sm font-bold">
            Rs. {numberToWords(data.summary.balanceDue)} Only
          </div>
        </div>
        <div className="flex h-full flex-col">
          <div className="grid grid-cols-[1fr_80px] px-1 py-1 text-xs">
            <div>GST Amt.</div>
            <div className="text-right">{data.summary.totalTax.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-[1fr_80px] border-t border-gray-200 px-1 py-1 text-xs">
            <div>SUB TOTAL</div>
            <div className="text-right">{data.summary.subtotal.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-[1fr_80px] border-t border-gray-200 px-1 py-1 text-xs">
            <div>Dis.</div>
            <div className="text-right">{data.summary.discount.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-[1fr_1fr] items-center px-1 py-2">
            <div className="text-base font-bold leading-none">
              GRAND
              <br />
              TOTAL
            </div>
            <div className="text-right text-lg font-bold">{data.summary.balanceDue.toFixed(2)}</div>
          </div>
          <div className="relative mt-8 flex h-full flex-col justify-end p-1 pt-4 text-right">
            <div className="w-full text-right text-xs font-bold">Pharmacist Sign</div>
            <div className="ml-auto mt-1 w-32 border-t border-black"></div>
          </div>
        </div>
      </div>

      {/* Bottom Banner */}
      <div className="border-t border-black p-1 text-center text-[11px] italic">
        Get well soon. Scan the Healthcare QR Code for complete health services, insurance, and
        government benefits.
      </div>
    </div>
  )
}
