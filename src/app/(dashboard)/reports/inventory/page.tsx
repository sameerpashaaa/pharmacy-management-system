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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'

interface StockRow {
  productId: string
  productName: string
  sku: string
  batchTotal: number
  availableQuantity: number
  reservedQuantity: number
  mrp: number
  value: number
}
interface ExpiryRow {
  batchId: string
  productName: string
  batchNumber: string
  quantity: number
  expiryDate: string
  daysToExpiry: number
}
interface ConsumptionRow {
  productId: string
  productName: string
  sku: string
  totalConsumed: number
  salesConsumed: number
  otherConsumed: number
}

export default function InventoryReportsPage() {
  const [stockData, setStockData] = useState<StockRow[]>([])
  const [expiryData, setExpiryData] = useState<ExpiryRow[]>([])
  const [consumptionData, setConsumptionData] = useState<ConsumptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('stock')

  useEffect(() => {
    void Promise.all([
      fetch('/api/reports/stock').then((res) => res.json()),
      fetch('/api/reports/expiry').then((res) => res.json()),
      fetch('/api/reports/consumption').then((res) => res.json()),
    ])
      .then(([stock, expiry, cons]) => {
        if ((stock as { success: boolean; data: StockRow[] }).success)
          setStockData((stock as { success: boolean; data: StockRow[] }).data)
        if ((expiry as { success: boolean; data: ExpiryRow[] }).success)
          setExpiryData((expiry as { success: boolean; data: ExpiryRow[] }).data)
        if ((cons as { success: boolean; data: ConsumptionRow[] }).success)
          setConsumptionData((cons as { success: boolean; data: ConsumptionRow[] }).data)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const exportCSV = () => {
    let dataToExport: StockRow[] | ExpiryRow[] | ConsumptionRow[] = []
    let filename = 'report.csv'
    if (activeTab === 'stock') {
      dataToExport = stockData
      filename = 'daily_stock_position.csv'
    } else if (activeTab === 'expiry') {
      dataToExport = expiryData
      filename = 'near_expiry_report.csv'
    } else {
      dataToExport = consumptionData
      filename = 'consumption_report.csv'
    }

    void import('papaparse').then((Papa) => {
      const csv = Papa.unparse(dataToExport as unknown as Record<string, unknown>[])
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', filename)
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
          <h1 className="text-2xl font-bold tracking-tight">Inventory &amp; Stock Reports</h1>
          <p className="text-muted-foreground">
            Monitor stock positions, expiries, and consumption
          </p>
        </div>
        <Button onClick={exportCSV}>Export CSV</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">Daily Stock Position</TabsTrigger>
          <TabsTrigger value="expiry">Near-Expiry</TabsTrigger>
          <TabsTrigger value="consumption">Consumption</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Available Qty</TableHead>
                    <TableHead>Reserved Qty</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockData.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell>{row.batchTotal}</TableCell>
                      <TableCell>{row.availableQuantity}</TableCell>
                      <TableCell>{row.reservedQuantity}</TableCell>
                      <TableCell>{formatCurrency(row.mrp)}</TableCell>
                      <TableCell>{formatCurrency(row.value)}</TableCell>
                    </TableRow>
                  ))}
                  {stockData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch Number</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Days to Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryData.map((row) => (
                    <TableRow key={row.batchId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{row.batchNumber}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>{formatDate(row.expiryDate)}</TableCell>
                      <TableCell className={row.daysToExpiry < 30 ? 'font-bold text-red-500' : ''}>
                        {row.daysToExpiry}
                      </TableCell>
                    </TableRow>
                  ))}
                  {expiryData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumption">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Total Consumed</TableHead>
                    <TableHead>Sales Consumed</TableHead>
                    <TableHead>Other Consumed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptionData.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell>{row.totalConsumed}</TableCell>
                      <TableCell>{row.salesConsumed}</TableCell>
                      <TableCell>{row.otherConsumed}</TableCell>
                    </TableRow>
                  ))}
                  {consumptionData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
