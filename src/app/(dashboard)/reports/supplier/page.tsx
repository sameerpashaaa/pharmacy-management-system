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
import { formatCurrency } from '@/lib/utils/currency'

interface SupplierRow {
  supplierId: string
  supplierName: string
  totalPurchases: number
  completedPurchases: number
  fulfillmentRate: number
  totalAmount: number
  outstandingBalance: number
}

export default function SupplierPerformancePage() {
  const [data, setData] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports/supplier')
      .then((res) => res.json())
      .then((res) => {
        if ((res as { success: boolean; data: SupplierRow[] }).success)
          setData((res as { success: boolean; data: SupplierRow[] }).data)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const exportCSV = () => {
    void import('papaparse').then((Papa) => {
      const csv = Papa.unparse(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', 'supplier_performance.csv')
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
          <h1 className="text-2xl font-bold tracking-tight">Supplier Performance</h1>
          <p className="text-muted-foreground">Fulfillment rates and outstanding balances</p>
        </div>
        <Button onClick={exportCSV}>Export CSV</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>Total Purchases</TableHead>
                <TableHead>Completed Purchases</TableHead>
                <TableHead>Fulfillment Rate</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Outstanding Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.supplierId}>
                  <TableCell className="font-medium">{row.supplierName}</TableCell>
                  <TableCell>{row.totalPurchases}</TableCell>
                  <TableCell>{row.completedPurchases}</TableCell>
                  <TableCell>{row.fulfillmentRate.toFixed(2)}%</TableCell>
                  <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
                  <TableCell>{formatCurrency(row.outstandingBalance)}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
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
