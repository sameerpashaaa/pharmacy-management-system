import { formatEodMessage } from './eod-formatter'
import type { EodReportData } from './eod-service'

describe('formatEodMessage', () => {
  it('formats a complete EOD summary message with all sections', () => {
    const mockData: EodReportData = {
      orgName: 'Apollo Meds',
      ownerPhone: '+919876543210',
      totalRevenue: 15420.5,
      costOfGoods: 9800.0,
      grossProfit: 5620.5,
      grossMarginPercent: 36.45,
      totalBills: 34,
      cashSales: 8200.0,
      cardUpiSales: 5220.5,
      creditSales: 2000.0,
      otherSales: 0,
      returnsToday: 350.0,
      topProducts: [
        { productName: 'Paracetamol 500mg', quantity: 85 },
        { productName: 'Amoxicillin 250mg', quantity: 42 },
      ],
      lowStockCount: 4,
      expiringIn30DaysCount: 2,
      pendingDues: 4500.0,
      cgstCollected: 420.25,
      sgstCollected: 420.25,
      igstCollected: 0,
      totalGstCollected: 840.5,
      reportDate: new Date('2026-09-23T20:00:00.000Z'),
    }

    const message = formatEodMessage(mockData)

    expect(message).toContain('Apollo Meds — Daily Report')
    expect(message).toContain('Total Revenue:')
    expect(message).toContain('₹15,420.50')
    expect(message).toContain('Gross Profit:')
    expect(message).toContain('₹5,620.50')
    expect(message).toContain('(36.5%)')
    expect(message).toContain('Total Bills:')
    expect(message).toContain('34')
    expect(message).toContain('Cash:')
    expect(message).toContain('Card / UPI:')
    expect(message).toContain('Credit:')
    expect(message).toContain('Returns Today:')
    expect(message).toContain('Paracetamol 500mg')
    expect(message).toContain('85 qty')
    expect(message).toContain('Low Stock Items:')
    expect(message).toContain('*4* products')
    expect(message).toContain('Expiring ≤ 30d:')
    expect(message).toContain('*2* batches')
    expect(message).toContain('Pending Dues:')
    expect(message).toContain('₹4,500.00')
    expect(message).toContain('CGST:')
    expect(message).toContain('SGST:')
    expect(message).toContain('Total Tax:')
  })

  it('handles empty top products and zero values gracefully', () => {
    const emptyData: EodReportData = {
      orgName: 'HealthCare Pharmacy',
      ownerPhone: null,
      totalRevenue: 0,
      costOfGoods: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      totalBills: 0,
      cashSales: 0,
      cardUpiSales: 0,
      creditSales: 0,
      otherSales: 0,
      returnsToday: 0,
      topProducts: [],
      lowStockCount: 0,
      expiringIn30DaysCount: 0,
      pendingDues: 0,
      cgstCollected: 0,
      sgstCollected: 0,
      igstCollected: 0,
      totalGstCollected: 0,
      reportDate: new Date('2026-09-23T20:00:00.000Z'),
    }

    const message = formatEodMessage(emptyData)

    expect(message).toContain('HealthCare Pharmacy — Daily Report')
    expect(message).toContain('No sales recorded today')
    expect(message).toContain('Pending Dues:')
    expect(message).toContain('None ✅')
  })
})
