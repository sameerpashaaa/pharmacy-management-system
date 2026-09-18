'use client'

import { format, parseISO } from 'date-fns'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/currency'

interface SalesTrendChartProps {
  data: { date: string; total: number }[]
  days: number
}

export function SalesTrendChart({ data, days }: SalesTrendChartProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleDaysChange = (value: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('days', value)

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const formattedData = data.map((item) => ({
    ...item,
    formattedDate: format(parseISO(item.date), 'MMM dd'),
  }))

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Sales Trend</CardTitle>
          <CardDescription>Daily sales total over time</CardDescription>
        </div>
        <Select
          defaultValue={days.toString()}
          onValueChange={handleDaysChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div
          className={`mt-4 h-[300px] w-full ${isPending ? 'opacity-50' : 'opacity-100'} transition-opacity duration-200`}
        >
          {formattedData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No sales data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {days <= 30 ? (
                <BarChart data={formattedData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="formattedDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    dy={10}
                  />
                  <YAxis
                    tickFormatter={(value) => `₹${value}`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    dx={-10}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Sales']}
                    labelStyle={{ color: '#374151', fontWeight: 500 }}
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              ) : (
                <LineChart data={formattedData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="formattedDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    dy={10}
                  />
                  <YAxis
                    tickFormatter={(value) => `₹${value}`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    dx={-10}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Sales']}
                    labelStyle={{ color: '#374151', fontWeight: 500 }}
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
