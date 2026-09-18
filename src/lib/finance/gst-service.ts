import { GstTxType, Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { assertBranchAccess, type AuthUser } from '@/lib/inventory/branch-access'
import type { FileGstPeriodInput, GstReportQuery, GstSyncInput } from '@/lib/validations/finance'

function formatReturnPeriod(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}-${year}`
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0)
}

export async function postGstTransactionForSale(
  saleId: string,
  txClient?: Prisma.TransactionClient
) {
  const client = txClient ?? prisma
  if (!client.sale?.findUnique || !client.gstTransaction?.create) return []
  const sale = await client.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      branch: true,
      items: true,
    },
  })
  if (!sale || sale.status === 'CANCELLED') return []

  const returnPeriod = formatReturnPeriod(sale.saleDate)
  const isB2B = Boolean(sale.customer?.gstin && sale.customer.gstin.trim().length >= 15)
  const txType = isB2B ? GstTxType.B2B : GstTxType.B2C

  const createdTransactions = []
  for (const item of sale.items) {
    const isExempt = item.taxPercent.equals(0) || item.taxAmount.equals(0)
    const finalType = isExempt ? GstTxType.NIL_RATED : txType
    const taxableAmount = item.totalAmount.sub(item.taxAmount)

    let cgstAmount = new Prisma.Decimal(0)
    let sgstAmount = new Prisma.Decimal(0)
    let igstAmount = new Prisma.Decimal(0)

    if (item.igstPercent.gt(0)) {
      igstAmount = item.taxAmount
    } else {
      cgstAmount = item.taxAmount.div(2)
      sgstAmount = item.taxAmount.div(2)
    }

    const gstTx = await client.gstTransaction.create({
      data: {
        branchId: sale.branchId,
        type: finalType,
        referenceType: 'SALE',
        referenceId: sale.id,
        referenceLineId: item.id,
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: sale.saleDate,
        partyGstin: sale.customer?.gstin ?? null,
        partyName: sale.customer?.name ?? 'Walk-in Customer',
        partyState: sale.customer?.state ?? sale.branch.state ?? null,
        hsnCode: item.hsnCode ?? null,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax: item.taxAmount,
        totalAmount: item.totalAmount,
        returnPeriod,
        isFiled: false,
      },
    })
    createdTransactions.push(gstTx)
  }

  return createdTransactions
}

export async function postGstTransactionForPurchase(
  purchaseId: string,
  txClient?: Prisma.TransactionClient
) {
  const client = txClient ?? prisma
  if (!client.purchase?.findUnique || !client.gstTransaction?.create) return []
  const purchase = await client.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: true,
      branch: true,
      items: true,
    },
  })
  if (!purchase || purchase.status === 'CANCELLED') return []

  const returnPeriod = formatReturnPeriod(purchase.createdAt)
  const createdTransactions = []

  for (const item of purchase.items) {
    const taxableAmount = item.totalAmount.sub(item.taxAmount)
    const halfTax = item.taxAmount.div(2)

    const gstTx = await client.gstTransaction.create({
      data: {
        branchId: purchase.branchId,
        type: GstTxType.B2B,
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
        referenceLineId: item.id,
        invoiceNumber: purchase.invoiceNumber ?? purchase.purchaseNumber,
        invoiceDate: purchase.invoiceDate ?? purchase.createdAt,
        partyGstin: purchase.supplier.gstin ?? null,
        partyName: purchase.supplier.name,
        partyState: purchase.supplier.state ?? purchase.branch.state ?? null,
        hsnCode: null,
        taxableAmount,
        cgstAmount: halfTax,
        sgstAmount: halfTax,
        igstAmount: 0,
        totalTax: item.taxAmount,
        totalAmount: item.totalAmount,
        returnPeriod,
        isFiled: false,
      },
    })
    createdTransactions.push(gstTx)
  }

  return createdTransactions
}

export async function syncMissingGstTransactions(params: Partial<GstSyncInput>, actor: AuthUser) {
  // NOTE: input is validated with gstSyncSchema by all HTTP entry points
  // (see src/app/api/gst/sync/route.ts). The service itself must stay free
  // of runtime zod imports: importing zod here breaks the production
  // webpack build ("Cannot get final name for export 'z' of zod").
  const query = params
  if (query.branchId) await assertBranchAccess(actor, query.branchId)
  const branchId = query.branchId ?? actor.branchId ?? undefined

  const sales = await prisma.sale.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: { not: 'CANCELLED' },
      ...(query.from || query.to
        ? {
            saleDate: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }
        : {}),
    },
    include: { items: { select: { id: true } } },
  })

  let syncedSales = 0
  for (const s of sales) {
    for (const item of s.items) {
      const existing = await prisma.gstTransaction.count({
        where: { referenceType: 'SALE', referenceId: s.id, referenceLineId: item.id },
      })
      if (existing === 0) {
        await postGstTransactionForSale(s.id)
        syncedSales++
        break // postGstTransactionForSale creates all lines for the sale
      }
    }
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: { not: 'CANCELLED' },
      ...(query.from || query.to
        ? {
            createdAt: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }
        : {}),
    },
    include: { items: { select: { id: true } } },
  })

  let syncedPurchases = 0
  for (const p of purchases) {
    for (const item of p.items) {
      const existing = await prisma.gstTransaction.count({
        where: { referenceType: 'PURCHASE', referenceId: p.id, referenceLineId: item.id },
      })
      if (existing === 0) {
        await postGstTransactionForPurchase(p.id)
        syncedPurchases++
        break // postGstTransactionForPurchase creates all lines for the purchase
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'GST_TRANSACTIONS_SYNC',
      entity: 'GstTransaction',
      metadata: { syncedSales, syncedPurchases, branchId },
    },
  })

  return {
    syncedSales,
    syncedPurchases,
    totalSynced: syncedSales + syncedPurchases,
  }
}

export async function getGstr1Report(params: Partial<GstReportQuery>, actor: AuthUser) {
  // NOTE: validated with gstReportQuerySchema by the HTTP entry points (see
  // src/app/api/gst/reports/*). No runtime zod import here (webpack build).
  const query = params
  if (query.branchId) await assertBranchAccess(actor, query.branchId)
  const branchId = query.branchId ?? actor.branchId ?? undefined
  const limit = query.limit ?? 1000

  const where: Prisma.GstTransactionWhereInput = {
    referenceType: 'SALE',
    ...(branchId ? { branchId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.returnPeriod ? { returnPeriod: query.returnPeriod } : {}),
    ...(query.filed !== undefined ? { isFiled: query.filed } : {}),
    ...(query.from || query.to
      ? {
          invoiceDate: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          },
        }
      : {}),
  }

  const [b2bRows, b2cRows, hsnGrouped, summary] = await Promise.all([
    prisma.gstTransaction.findMany({
      where: { ...where, type: GstTxType.B2B },
      orderBy: { invoiceDate: 'desc' },
      take: limit,
    }),
    prisma.gstTransaction.findMany({
      where: { ...where, type: GstTxType.B2C },
      orderBy: { invoiceDate: 'desc' },
      take: limit,
    }),
    prisma.gstTransaction.groupBy({
      by: ['hsnCode'],
      where,
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalTax: true,
        totalAmount: true,
      },
      _count: true,
      orderBy: { hsnCode: 'asc' },
    }),
    prisma.gstTransaction.aggregate({
      where,
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalTax: true,
        totalAmount: true,
      },
      _count: true,
    }),
  ])

  return {
    returnPeriod: query.returnPeriod ?? 'ALL',
    summary: {
      transactionCount: summary._count,
      taxableAmount: toNumber(summary._sum.taxableAmount),
      cgstAmount: toNumber(summary._sum.cgstAmount),
      sgstAmount: toNumber(summary._sum.sgstAmount),
      igstAmount: toNumber(summary._sum.igstAmount),
      totalTax: toNumber(summary._sum.totalTax),
      totalAmount: toNumber(summary._sum.totalAmount),
    },
    b2b: b2bRows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate.toISOString(),
      partyName: r.partyName,
      partyGstin: r.partyGstin,
      partyState: r.partyState,
      taxableAmount: toNumber(r.taxableAmount),
      cgstAmount: toNumber(r.cgstAmount),
      sgstAmount: toNumber(r.sgstAmount),
      igstAmount: toNumber(r.igstAmount),
      totalTax: toNumber(r.totalTax),
      totalAmount: toNumber(r.totalAmount),
      isFiled: r.isFiled,
    })),
    b2c: b2cRows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate.toISOString(),
      partyName: r.partyName,
      partyState: r.partyState,
      taxableAmount: toNumber(r.taxableAmount),
      cgstAmount: toNumber(r.cgstAmount),
      sgstAmount: toNumber(r.sgstAmount),
      igstAmount: toNumber(r.igstAmount),
      totalTax: toNumber(r.totalTax),
      totalAmount: toNumber(r.totalAmount),
      isFiled: r.isFiled,
    })),
    hsnSummary: hsnGrouped.map((h) => ({
      hsnCode: h.hsnCode ?? 'N/A',
      transactionCount: h._count,
      taxableAmount: toNumber(h._sum.taxableAmount),
      cgstAmount: toNumber(h._sum.cgstAmount),
      sgstAmount: toNumber(h._sum.sgstAmount),
      igstAmount: toNumber(h._sum.igstAmount),
      totalTax: toNumber(h._sum.totalTax),
      totalAmount: toNumber(h._sum.totalAmount),
    })),
  }
}

export async function getGstr3bReport(params: Partial<GstReportQuery>, actor: AuthUser) {
  // NOTE: validated with gstReportQuerySchema by the HTTP entry points (see
  // src/app/api/gst/reports/*). No runtime zod import here (webpack build).
  const query = params
  if (query.branchId) await assertBranchAccess(actor, query.branchId)
  const branchId = query.branchId ?? actor.branchId ?? undefined

  const baseWhere: Prisma.GstTransactionWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(query.returnPeriod ? { returnPeriod: query.returnPeriod } : {}),
    ...(query.filed !== undefined ? { isFiled: query.filed } : {}),
    ...(query.from || query.to
      ? {
          invoiceDate: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          },
        }
      : {}),
  }

  const [outwardSupplies, inwardPurchases] = await Promise.all([
    prisma.gstTransaction.aggregate({
      where: { ...baseWhere, referenceType: 'SALE' },
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalTax: true,
        totalAmount: true,
      },
      _count: true,
    }),
    prisma.gstTransaction.aggregate({
      where: { ...baseWhere, referenceType: 'PURCHASE' },
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalTax: true,
        totalAmount: true,
      },
      _count: true,
    }),
  ])

  const outTaxable = toNumber(outwardSupplies._sum.taxableAmount)
  const outCgst = toNumber(outwardSupplies._sum.cgstAmount)
  const outSgst = toNumber(outwardSupplies._sum.sgstAmount)
  const outIgst = toNumber(outwardSupplies._sum.igstAmount)
  const outTotalTax = toNumber(outwardSupplies._sum.totalTax)

  const inTaxable = toNumber(inwardPurchases._sum.taxableAmount)
  const inCgst = toNumber(inwardPurchases._sum.cgstAmount)
  const inSgst = toNumber(inwardPurchases._sum.sgstAmount)
  const inIgst = toNumber(inwardPurchases._sum.igstAmount)
  const inTotalTax = toNumber(inwardPurchases._sum.totalTax)

  const netCgst = Math.max(0, Math.round((outCgst - inCgst) * 100) / 100)
  const netSgst = Math.max(0, Math.round((outSgst - inSgst) * 100) / 100)
  const netIgst = Math.max(0, Math.round((outIgst - inIgst) * 100) / 100)
  const netPayable = Math.round((netCgst + netSgst + netIgst) * 100) / 100

  return {
    returnPeriod: query.returnPeriod ?? 'ALL',
    table31OutwardSupplies: {
      title: '3.1 Details of Outward Supplies and inward supplies liable to reverse charge',
      taxableAmount: outTaxable,
      cgstAmount: outCgst,
      sgstAmount: outSgst,
      igstAmount: outIgst,
      totalTax: outTotalTax,
      invoiceCount: outwardSupplies._count,
    },
    table4EligibleItc: {
      title: '4. Eligible ITC (Input Tax Credit)',
      taxableAmount: inTaxable,
      cgstAmount: inCgst,
      sgstAmount: inSgst,
      igstAmount: inIgst,
      totalTax: inTotalTax,
      invoiceCount: inwardPurchases._count,
    },
    table6PaymentOfTax: {
      title: '6. Payment of Tax (Net Tax Payable)',
      netCgstPayable: netCgst,
      netSgstPayable: netSgst,
      netIgstPayable: netIgst,
      netTotalPayable: netPayable,
    },
  }
}

export async function fileGstReturnPeriod(params: FileGstPeriodInput, actor: AuthUser) {
  // NOTE: validated with fileGstPeriodSchema by the HTTP entry point (see
  // src/app/api/gst/file/route.ts). No runtime zod import here (webpack build).
  const input = params
  if (input.branchId) await assertBranchAccess(actor, input.branchId)
  const branchId = input.branchId ?? actor.branchId ?? undefined

  const where: Prisma.GstTransactionWhereInput = {
    returnPeriod: input.returnPeriod,
    isFiled: false,
    ...(branchId ? { branchId } : {}),
  }

  const result = await prisma.gstTransaction.updateMany({
    where,
    data: { isFiled: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'GST_RETURN_FILE',
      entity: 'GstTransaction',
      metadata: {
        returnPeriod: input.returnPeriod,
        branchId,
        updatedCount: result.count,
      },
    },
  })

  return {
    returnPeriod: input.returnPeriod,
    updatedCount: result.count,
  }
}
