// ─────────────────────────────────────────────────────────────
// EOD Formatter — WhatsApp Message Builder
//
// Pure function: takes EodReportData → formatted WhatsApp string.
// Uses WhatsApp markdown: *bold*, _italic_.
// No side effects — fully unit-testable.
// ─────────────────────────────────────────────────────────────
import { format } from 'date-fns'

import type { EodReportData } from './eod-service'

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function padLabel(label: string, width = 22): string {
  return label.padEnd(width, ' ')
}

export function formatEodMessage(data: EodReportData): string {
  const dateStr = format(data.reportDate, 'EEEE, d MMM yyyy')
  const profitSign = data.grossProfit >= 0 ? '✅' : '🔴'
  const profitLabel = data.grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss'

  const topProductLines =
    data.topProducts.length > 0
      ? data.topProducts
          .map((p, i) => `${i + 1}. ${p.productName.slice(0, 22).padEnd(23)} — *${p.quantity} qty*`)
          .join('\n')
      : '   No sales recorded today.'

  const lines = [
    `📊 *${data.orgName} — Daily Report*`,
    `📅 ${dateStr}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *REVENUE & PROFIT*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🟢 ${padLabel('Total Revenue:')} *${formatCurrency(data.totalRevenue)}*`,
    `📦 ${padLabel('Cost of Goods:')} ${formatCurrency(data.costOfGoods)}`,
    `${profitSign} ${padLabel(`${profitLabel}:`)} *${formatCurrency(data.grossProfit)}*  _(${data.grossMarginPercent.toFixed(1)}%)_`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🧾 *SALES BREAKDOWN*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔢 ${padLabel('Total Bills:')} *${data.totalBills}*`,
    `💵 ${padLabel('Cash:')} ${formatCurrency(data.cashSales)}`,
    `💳 ${padLabel('Card / UPI:')} ${formatCurrency(data.cardUpiSales)}`,
    `📒 ${padLabel('Credit:')} ${formatCurrency(data.creditSales)}`,
    ...(data.otherSales > 0 ? [`🏦 ${padLabel('Other:')} ${formatCurrency(data.otherSales)}`] : []),
    ...(data.returnsToday > 0
      ? [`🔁 ${padLabel('Returns Today:')} ${formatCurrency(data.returnsToday)}`]
      : []),
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🏆 *TOP ${data.topProducts.length > 0 ? data.topProducts.length : '5'} PRODUCTS*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    topProductLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ *ALERTS*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📉 ${padLabel('Low Stock Items:')} *${data.lowStockCount}* products`,
    `⏰ ${padLabel('Expiring ≤ 30d:')} *${data.expiringIn30DaysCount}* batches`,
    ...(data.pendingDues > 0
      ? [`💳 ${padLabel('Pending Dues:')} *${formatCurrency(data.pendingDues)}*`]
      : [`💳 ${padLabel('Pending Dues:')} None ✅`]),
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🧾 *GST COLLECTED TODAY*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `   ${padLabel('CGST:')} ${formatCurrency(data.cgstCollected)}`,
    `   ${padLabel('SGST:')} ${formatCurrency(data.sgstCollected)}`,
    ...(data.igstCollected > 0
      ? [`   ${padLabel('IGST:')} ${formatCurrency(data.igstCollected)}`]
      : []),
    `   ${padLabel('Total Tax:')} *${formatCurrency(data.totalGstCollected)}*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `_Sent automatically by PharmaCare_ 🚀`,
  ]

  return lines.join('\n')
}
