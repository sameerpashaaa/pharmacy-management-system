'use client'

import { useState, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils/date'

interface NarcoticRow {
  id: string
  date: string
  productName: string
  drugSchedule: string
  type: string
  referenceType: string
  referenceId: string
  quantity: number
  quantityBefore: number
  quantityAfter: number
}

export default function NarcoticRegisterPage() {
  const [data, setData] = useState<NarcoticRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reports/narcotics')
      .then((res) => res.json())
      .then((res) => {
        const body = res as {
          success: boolean
          data: NarcoticRow[]
          pagination?: { total: number }
        }
        if (!body.success) {
          setError('Failed to load narcotic register. Please try again.')
          return
        }
        setData(body.data)
        setTotal(body.pagination?.total ?? body.data.length)
      })
      .catch(() => setError('Failed to load narcotic register. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const exportCSV = () => {
    void import('papaparse').then((Papa) => {
      const csv = Papa.unparse(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', 'narcotic_register.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  if (loading) return <div>Loading...</div>

  if (error)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Narcotic Register</h1>
        <p className="text-red-500">{error}</p>
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Narcotic Register</h1>
          <p className="text-muted-foreground">Audit log for Schedule X and H1 drugs</p>
        </div>
        <Button onClick={exportCSV}>Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Showing {data.length} of {total} records
      </p>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell>{row.drugSchedule}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>
                    {row.referenceType} - {row.referenceId}
                  </TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{row.quantityBefore}</TableCell>
                  <TableCell>{row.quantityAfter}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No data found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
