'use client'

import { useState, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils/currency'

interface DailyBreakdown {
  date: string
  salesCount: number
  revenue: number
  tax: number
  discount: number
}

interface SalesData {
  totalSalesCount: number
  totalRevenue: number
  totalTax: number
  totalDiscount: number
  dailyBreakdown: DailyBreakdown[]
}

export default function SalesReportsPage() {
  const [data, setData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports/sales')
      .then((res) => res.json())
      .then((res) => {
        if ((res as { success: boolean; data: SalesData }).success)
          setData((res as { success: boolean; data: SalesData }).data)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const exportCSV = () => {
    if (!data) return
    void import('papaparse').then((Papa) => {
      const csv = Papa.unparse(data.dailyBreakdown)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', 'sales_report.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales &amp; Financial Report</h1>
          <p className="text-muted-foreground">Revenue and sales breakdown</p>
        </div>
        <Button onClick={exportCSV}>Export CSV</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalSalesCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data?.totalRevenue ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Tax</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data?.totalTax ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data?.totalDiscount ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Sales Count</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.dailyBreakdown?.map((day: DailyBreakdown) => (
                <TableRow key={day.date}>
                  <TableCell>{day.date}</TableCell>
                  <TableCell>{day.salesCount}</TableCell>
                  <TableCell>{formatCurrency(day.revenue)}</TableCell>
                  <TableCell>{formatCurrency(day.tax)}</TableCell>
                  <TableCell>{formatCurrency(day.discount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
