import type { Ledger, LedgerEntry, Prisma as PrismaTypes } from '@prisma/client'
import { LedgerEntryType, Prisma } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { ensureDefaultLedgers } from '@/lib/finance/coa-seed'
import { assertBranchAccess, type AuthUser } from '@/lib/inventory/branch-access'
import type {
  CreateLedgerEntryInput,
  CreateLedgerInput,
  FinanceDateRangeQuery,
  GstReportQuery,
  LedgerListQuery,
  PartyLedgerQuery,
  PartyStatementQuery,
  RecordPartyPaymentInput,
} from '@/lib/validations/finance'
import {
  financeDateRangeSchema,
  gstReportQuerySchema,
  ledgerListQuerySchema,
  partyLedgerQuerySchema,
  partyStatementQuerySchema,
  recordPartyPaymentSchema,
} from '@/lib/validations/finance'

export interface FinanceSummaryScope {
  /** Branch the transactional totals (sales/purchases/tax) are scoped to, or null when global. */
  branchId: string | null
  /** Scope of sales/purchases/tax aggregates. */
  transactionTotals: 'BRANCH' | 'GLOBAL'
  /**
   * Scope of party balances and cash. Always GLOBAL: Customer, Supplier
   * and Payment rows carry no branch, so these aggregates cannot be
   * branch-scoped without a schema change.
   */
  partyBalances: 'GLOBAL'
  cashCollected: 'GLOBAL'
}

export interface FinanceSummary {
  sales: number
  purchases: number
  customerReceivables: number
  supplierPayables: number
  cashCollected: number
  taxCollected: number
  taxPaid: number
  netGstPayable: number
  scope: FinanceSummaryScope
}

export interface GstSummary {
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalTax: number
  totalAmount: number
  transactionCount: number
  byType: {
    type: string
    taxableAmount: number
    totalTax: number
    totalAmount: number
    transactionCount: number
  }[]
  byHsn: {
    hsnCode: string | null
    taxableAmount: number
    totalTax: number
    totalAmount: number
    transactionCount: number
  }[]
}

function toNumber(value: PrismaTypes.Decimal | number | null | undefined): number {
  return Number(value ?? 0)
}

function sumDecimal<T extends string>(
  row: Record<T, Prisma.Decimal | number | null>
): Record<T, number> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      toNumber(value as PrismaTypes.Decimal | number),
    ])
  ) as Record<T, number>
}

function dateRangeWhere(range: FinanceDateRangeQuery) {
  return {
    ...(range.from || range.to
      ? {
          gte: range.from ? new Date(range.from) : undefined,
          lte: range.to ? new Date(range.to) : undefined,
        }
      : {}),
  }
}

export async function getFinanceSummary(
  params: Partial<FinanceDateRangeQuery>,
  actor: AuthUser
): Promise<FinanceSummary> {
  const query = financeDateRangeSchema.parse(params)
  if (query.branchId) await assertBranchAccess(actor, query.branchId)
  const branchId = query.branchId ?? actor.branchId ?? undefined
  const saleDate = dateRangeWhere(query)
  const purchaseDate = dateRangeWhere(query)

  const [saleTotals, purchaseTotals, customerTotals, supplierTotals, paymentTotals] =
    await Promise.all([
      prisma.sale.aggregate({
        where: {
          ...(branchId ? { branchId } : {}),
          ...(Object.keys(saleDate).length ? { saleDate } : {}),
          status: { not: 'CANCELLED' },
        },
        _sum: { totalAmount: true, taxAmount: true, amountPaid: true },
      }),
      prisma.purchase.aggregate({
        where: {
          ...(branchId ? { branchId } : {}),
          ...(Object.keys(purchaseDate).length ? { purchaseDate } : {}),
          status: { not: 'CANCELLED' },
        },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      prisma.customer.aggregate({ _sum: { outstandingBalance: true } }),
      prisma.supplier.aggregate({ _sum: { outstandingBalance: true } }),
      prisma.payment.aggregate({
        where: {
          ...(Object.keys(dateRangeWhere(query)).length
            ? { paymentDate: dateRangeWhere(query) }
            : {}),
          // Only ACTIVE non-credit receipts represent money actually taken.
          // VOIDED payments are canceled sale artifacts; REFUND rows are
          // money returned (negative) and would otherwise inflate cash.
          method: { not: 'CREDIT' },
          status: 'ACTIVE',
          supplierId: null,
          purchaseId: null,
        },
        _sum: { amount: true },
      }),
    ])

  const sales = toNumber(saleTotals._sum.totalAmount)
  const purchases = toNumber(purchaseTotals._sum.totalAmount)
  const taxCollected = toNumber(saleTotals._sum.taxAmount)
  const taxPaid = toNumber(purchaseTotals._sum.taxAmount)

  return {
    sales,
    purchases,
    customerReceivables: toNumber(customerTotals._sum.outstandingBalance),
    supplierPayables: toNumber(supplierTotals._sum.outstandingBalance),
    cashCollected: toNumber(paymentTotals._sum.amount),
    taxCollected,
    taxPaid,
    netGstPayable: Math.round((taxCollected - taxPaid) * 100) / 100,
    scope: {
      branchId: branchId ?? null,
      transactionTotals: branchId ? 'BRANCH' : 'GLOBAL',
      partyBalances: 'GLOBAL',
      cashCollected: 'GLOBAL',
    },
  }
}

export async function listLedgers(params: Partial<LedgerListQuery> = {}): Promise<{
  data: (Ledger & {
    parent: { id: string; code: string; name: string } | null
    _count: { entries: number }
  })[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const query = ledgerListQuerySchema.parse(params)
  await ensureDefaultLedgers()
  const where: PrismaTypes.LedgerWhereInput = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const skip = (query.page - 1) * query.limit

  const [data, total] = await Promise.all([
    prisma.ledger.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { entries: true } },
      },
    }),
    prisma.ledger.count({ where }),
  ])

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  }
}

export async function getLedgerById(id: string) {
  const ledger = await prisma.ledger.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, code: true, name: true } },
      children: { select: { id: true, code: true, name: true, balance: true } },
      entries: {
        take: 50,
        orderBy: { entryDate: 'desc' },
      },
      _count: { select: { entries: true } },
    },
  })
  if (!ledger) throw new Error('Not Found: ledger')
  return ledger
}

export async function createLedger(data: CreateLedgerInput, actor: AuthUser): Promise<Ledger> {
  const openingBalance = new Prisma.Decimal(data.openingBalance)

  return prisma.$transaction(async (tx) => {
    if (data.parentId) {
      const parent = await tx.ledger.findUnique({ where: { id: data.parentId } })
      if (!parent) throw new Error('Not Found: parent ledger')
      if (parent.type !== data.type)
        throw new Error('Parent ledger type must match child ledger type')
    }

    const ledger = await tx.ledger.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: data.parentId ?? null,
        balance: openingBalance,
      },
    })

    if (openingBalance.gt(0)) {
      await tx.ledgerEntry.create({
        data: {
          ledgerId: ledger.id,
          type: 'DEBIT',
          amount: openingBalance,
          balance: openingBalance,
          description: 'Opening balance',
          referenceType: 'OPENING_BALANCE',
          referenceId: ledger.id,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'LEDGER_CREATE',
        entity: 'Ledger',
        entityId: ledger.id,
        metadata: { code: ledger.code, type: ledger.type },
      },
    })

    return ledger
  })
}

export async function createLedgerEntry(
  data: CreateLedgerEntryInput,
  actor: AuthUser
): Promise<LedgerEntry> {
  await ensureDefaultLedgers()
  const amount = new Prisma.Decimal(data.amount)

  return prisma.$transaction(async (tx) => {
    const ledger = await tx.ledger.findUnique({ where: { id: data.ledgerId } })
    if (!ledger) throw new Error('Not Found: ledger')

    const newBalance =
      data.type === LedgerEntryType.DEBIT ? ledger.balance.add(amount) : ledger.balance.sub(amount)

    const entry = await tx.ledgerEntry.create({
      data: {
        ledgerId: data.ledgerId,
        type: data.type,
        amount,
        balance: newBalance,
        description: data.description,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        entryDate: data.entryDate ? new Date(data.entryDate) : new Date(),
      },
    })

    await tx.ledger.update({ where: { id: ledger.id }, data: { balance: newBalance } })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'LEDGER_ENTRY_CREATE',
        entity: 'LedgerEntry',
        entityId: entry.id,
        metadata: { ledgerId: ledger.id, amount: data.amount, type: data.type },
      },
    })

    return entry
  })
}

export async function listReceivables(params: Partial<PartyLedgerQuery> = {}) {
  const query = partyLedgerQuerySchema.parse(params)
  const where: PrismaTypes.CustomerWhereInput = {
    ...(query.status === 'OUTSTANDING' ? { outstandingBalance: { gt: 0 } } : {}),
    ...(query.status === 'CLEAR' ? { outstandingBalance: { equals: 0 } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const skip = (query.page - 1) * query.limit
  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [query.sortBy]: query.sortOrder },
    }),
    prisma.customer.count({ where }),
  ])
  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  }
}

export async function listPayables(params: Partial<PartyLedgerQuery> = {}) {
  const query = partyLedgerQuerySchema.parse(params)
  const where: PrismaTypes.SupplierWhereInput = {
    ...(query.status === 'OUTSTANDING' ? { outstandingBalance: { gt: 0 } } : {}),
    ...(query.status === 'CLEAR' ? { outstandingBalance: { equals: 0 } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const skip = (query.page - 1) * query.limit
  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [query.sortBy]: query.sortOrder },
    }),
    prisma.supplier.count({ where }),
  ])
  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  }
}

export async function getCustomerLedgerStatement(
  customerId: string,
  params: Partial<PartyStatementQuery> = {}
) {
  const query = partyStatementQuerySchema.parse(params)
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      gstin: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      creditLimit: true,
      outstandingBalance: true,
      creditDays: true,
      isActive: true,
    },
  })
  if (!customer) throw new Error('Not Found: customer')

  const where: PrismaTypes.CustomerLedgerWhereInput = {
    customerId,
    ...(query.from || query.to
      ? {
          entryDate: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          },
        }
      : {}),
  }

  const skip = (query.page - 1) * query.limit
  const [entries, total] = await Promise.all([
    prisma.customerLedger.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { entryDate: 'desc' },
    }),
    prisma.customerLedger.count({ where }),
  ])

  return {
    customer: {
      ...customer,
      creditLimit: Number(customer.creditLimit),
      outstandingBalance: Number(customer.outstandingBalance),
    },
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      balance: Number(e.balance),
      description: e.description,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      entryDate: e.entryDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  }
}

export async function recordCustomerPayment(
  customerId: string,
  params: RecordPartyPaymentInput,
  actor: AuthUser
) {
  await ensureDefaultLedgers()
  const input = recordPartyPaymentSchema.parse(params)
  const amount = new Prisma.Decimal(input.amount)

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new Error('Not Found: customer')

    const newBalance = customer.outstandingBalance.sub(amount)

    const payment = await tx.payment.create({
      data: {
        method: input.paymentMethod,
        amount,
        reference: input.reference ?? null,
        customerId: customer.id,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      },
    })

    const ledgerEntry = await tx.customerLedger.create({
      data: {
        customerId: customer.id,
        type: LedgerEntryType.CREDIT,
        amount,
        balance: newBalance,
        description: input.notes?.trim() || `Payment received via ${input.paymentMethod}`,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        entryDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      },
    })

    await tx.customer.update({
      where: { id: customer.id },
      data: { outstandingBalance: newBalance },
    })

    const cashOrBankCode = input.paymentMethod === 'CASH' ? '1010' : '1020'
    const [cashLedger, arLedger] = await Promise.all([
      tx.ledger.findUnique({ where: { code: cashOrBankCode } }),
      tx.ledger.findUnique({ where: { code: '1030' } }),
    ])

    if (cashLedger) {
      const newCashBal = cashLedger.balance.add(amount)
      await tx.ledgerEntry.create({
        data: {
          ledgerId: cashLedger.id,
          type: LedgerEntryType.DEBIT,
          amount,
          balance: newCashBal,
          description: `Customer payment: ${customer.name}`,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
        },
      })
      await tx.ledger.update({ where: { id: cashLedger.id }, data: { balance: newCashBal } })
    }

    if (arLedger) {
      const newArBal = arLedger.balance.sub(amount)
      await tx.ledgerEntry.create({
        data: {
          ledgerId: arLedger.id,
          type: LedgerEntryType.CREDIT,
          amount,
          balance: newArBal,
          description: `Customer payment: ${customer.name}`,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
        },
      })
      await tx.ledger.update({ where: { id: arLedger.id }, data: { balance: newArBal } })
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'CUSTOMER_PAYMENT_RECORD',
        entity: 'Customer',
        entityId: customer.id,
        metadata: {
          paymentId: payment.id,
          amount: input.amount,
          method: input.paymentMethod,
          previousBalance: Number(customer.outstandingBalance),
          newBalance: Number(newBalance),
        },
      },
    })

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        reference: payment.reference,
        paymentDate: payment.paymentDate.toISOString(),
      },
      ledgerEntry: {
        id: ledgerEntry.id,
        type: ledgerEntry.type,
        amount: Number(ledgerEntry.amount),
        balance: Number(ledgerEntry.balance),
        entryDate: ledgerEntry.entryDate.toISOString(),
      },
      newBalance: Number(newBalance),
    }
  })
}

export async function getSupplierLedgerStatement(
  supplierId: string,
  params: Partial<PartyStatementQuery> = {}
) {
  const query = partyStatementQuerySchema.parse(params)
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      phone: true,
      email: true,
      gstin: true,
      pan: true,
      dlNumber: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      creditDays: true,
      outstandingBalance: true,
      isActive: true,
    },
  })
  if (!supplier) throw new Error('Not Found: supplier')

  const where: PrismaTypes.SupplierLedgerWhereInput = {
    supplierId,
    ...(query.from || query.to
      ? {
          entryDate: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          },
        }
      : {}),
  }

  const skip = (query.page - 1) * query.limit
  const [entries, total] = await Promise.all([
    prisma.supplierLedger.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { entryDate: 'desc' },
    }),
    prisma.supplierLedger.count({ where }),
  ])

  return {
    supplier: {
      ...supplier,
      outstandingBalance: Number(supplier.outstandingBalance),
    },
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      balance: Number(e.balance),
      description: e.description,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      entryDate: e.entryDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  }
}

export async function recordSupplierPayment(
  supplierId: string,
  params: RecordPartyPaymentInput,
  actor: AuthUser
) {
  await ensureDefaultLedgers()
  const input = recordPartyPaymentSchema.parse(params)
  const amount = new Prisma.Decimal(input.amount)

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) throw new Error('Not Found: supplier')

    const newBalance = supplier.outstandingBalance.sub(amount)

    const payment = await tx.payment.create({
      data: {
        method: input.paymentMethod,
        amount,
        reference: input.reference ?? null,
        supplierId: supplier.id,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      },
    })

    // A supplier payment reduces what we owe, matching the established
    // supplier-ledger convention (payments are CREDIT entries).
    const ledgerEntry = await tx.supplierLedger.create({
      data: {
        supplierId: supplier.id,
        type: LedgerEntryType.CREDIT,
        amount,
        balance: newBalance,
        description: input.notes?.trim() || `Payment made to supplier via ${input.paymentMethod}`,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        entryDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      },
    })

    await tx.supplier.update({
      where: { id: supplier.id },
      data: { outstandingBalance: newBalance },
    })

    const cashOrBankCode = input.paymentMethod === 'CASH' ? '1010' : '1020'
    const [apLedger, cashLedger] = await Promise.all([
      tx.ledger.findUnique({ where: { code: '2010' } }),
      tx.ledger.findUnique({ where: { code: cashOrBankCode } }),
    ])

    if (apLedger) {
      const newApBal = apLedger.balance.sub(amount)
      await tx.ledgerEntry.create({
        data: {
          ledgerId: apLedger.id,
          type: LedgerEntryType.DEBIT,
          amount,
          balance: newApBal,
          description: `Supplier settlement: ${supplier.name}`,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
        },
      })
      await tx.ledger.update({ where: { id: apLedger.id }, data: { balance: newApBal } })
    }

    if (cashLedger) {
      const newCashBal = cashLedger.balance.sub(amount)
      await tx.ledgerEntry.create({
        data: {
          ledgerId: cashLedger.id,
          type: LedgerEntryType.CREDIT,
          amount,
          balance: newCashBal,
          description: `Supplier settlement: ${supplier.name}`,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
        },
      })
      await tx.ledger.update({ where: { id: cashLedger.id }, data: { balance: newCashBal } })
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SUPPLIER_PAYMENT_RECORD',
        entity: 'Supplier',
        entityId: supplier.id,
        metadata: {
          paymentId: payment.id,
          amount: input.amount,
          method: input.paymentMethod,
          previousBalance: Number(supplier.outstandingBalance),
          newBalance: Number(newBalance),
        },
      },
    })

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        reference: payment.reference,
        paymentDate: payment.paymentDate.toISOString(),
      },
      ledgerEntry: {
        id: ledgerEntry.id,
        type: ledgerEntry.type,
        amount: Number(ledgerEntry.amount),
        balance: Number(ledgerEntry.balance),
        entryDate: ledgerEntry.entryDate.toISOString(),
      },
      newBalance: Number(newBalance),
    }
  })
}

export async function getGstSummary(
  params: Partial<GstReportQuery>,
  actor: AuthUser
): Promise<GstSummary> {
  const query = gstReportQuerySchema.parse(params)
  if (query.branchId) await assertBranchAccess(actor, query.branchId)
  const branchId = query.branchId ?? actor.branchId ?? undefined

  const where: PrismaTypes.GstTransactionWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.returnPeriod ? { returnPeriod: query.returnPeriod } : {}),
    ...(query.filed === undefined ? {} : { isFiled: query.filed }),
    ...(query.from || query.to ? { invoiceDate: dateRangeWhere(query) } : {}),
  }

  const [totals, byType, byHsn] = await Promise.all([
    prisma.gstTransaction.aggregate({
      where,
      _count: true,
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalTax: true,
        totalAmount: true,
      },
    }),
    prisma.gstTransaction.groupBy({
      by: ['type'],
      where,
      _count: true,
      _sum: { taxableAmount: true, totalTax: true, totalAmount: true },
      orderBy: { type: 'asc' },
    }),
    prisma.gstTransaction.groupBy({
      by: ['hsnCode'],
      where,
      _count: true,
      _sum: { taxableAmount: true, totalTax: true, totalAmount: true },
      orderBy: { hsnCode: 'asc' },
    }),
  ])

  return {
    ...sumDecimal(totals._sum),
    transactionCount: totals._count,
    byType: byType.map((row) => ({
      type: row.type,
      ...sumDecimal(row._sum),
      transactionCount: row._count,
    })),
    byHsn: byHsn.map((row) => ({
      hsnCode: row.hsnCode,
      ...sumDecimal(row._sum),
      transactionCount: row._count,
    })),
  }
}
