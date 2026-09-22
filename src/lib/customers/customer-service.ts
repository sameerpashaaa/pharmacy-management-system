// ─────────────────────────────────────────────────────────────
// Service — Customers
// Read-only customer records used by Sales, Prescriptions,
// CustomerLedger, SaleReturn, CreditNote. Writes from POS credit-capture
// live in sales-service. The /api/customers CRUD provides explicit
// admin-only visibility into that same record space.
// ─────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import type { User } from 'next-auth'

import prisma from '@/lib/db/prisma'
import type {
  CreateCustomerInput,
  CustomerListQuery,
  UpdateCustomerInput,
} from '@/lib/validations/customer'

export type CustomerActor = User

export interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  creditLimit: number
  outstandingBalance: number
  creditDays: number
  isActive: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

const decimalToNumber = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d)

function serialize(row: {
  id: string
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  creditLimit: Prisma.Decimal
  outstandingBalance: Prisma.Decimal
  creditDays: number
  isActive: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}): CustomerRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    creditLimit: decimalToNumber(row.creditLimit),
    outstandingBalance: decimalToNumber(row.outstandingBalance),
    creditDays: row.creditDays,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listCustomers(
  query: CustomerListQuery,
  _actor: CustomerActor
): Promise<{
  data: CustomerRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const page = query.page ?? 1
  const limit = query.limit ?? 20
  const search = query.search
  const where: Prisma.CustomerWhereInput = {}
  if (search && search.length > 0) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { gstin: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (typeof query.active === 'boolean') where.isActive = query.active

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
    prisma.customer.count({ where }),
  ])
  return {
    data: rows.map(serialize),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

export async function getCustomer(id: string, _actor: CustomerActor): Promise<CustomerRow | null> {
  const c = await prisma.customer.findUnique({ where: { id } })
  return c ? serialize(c) : null
}

export async function createCustomer(
  input: CreateCustomerInput,
  actor: CustomerActor
): Promise<CustomerRow> {
  // Email uniqueness guard (model has no @unique; phone is unique-ish by index only).
  if (input.email) {
    const exists = await prisma.customer.findFirst({ where: { email: input.email } })
    if (exists) throw new Error('Conflict: a customer with this email already exists')
  }
  const created = await prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      creditLimit: new Prisma.Decimal(input.creditLimit ?? 0),
      creditDays: input.creditDays ?? 0,
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'CREATE',
      entity: 'Customer',
      entityId: created.id,
      newData: { name: created.name, email: created.email, phone: created.phone },
    },
  })
  return serialize(created)
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  actor: CustomerActor
): Promise<CustomerRow> {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: customer')

  if (input.email && input.email !== existing.email) {
    const conflict = await prisma.customer.findFirst({ where: { email: input.email, NOT: { id } } })
    if (conflict) throw new Error('Conflict: a customer with this email already exists')
  }

  const data: Prisma.CustomerUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.phone !== undefined) data.phone = input.phone ?? null
  if (input.email !== undefined) data.email = input.email ?? null
  if (input.gstin !== undefined) data.gstin = input.gstin ?? null
  if (input.address !== undefined) data.address = input.address ?? null
  if (input.city !== undefined) data.city = input.city ?? null
  if (input.state !== undefined) data.state = input.state ?? null
  if (input.pincode !== undefined) data.pincode = input.pincode ?? null
  if (input.creditLimit !== undefined) data.creditLimit = new Prisma.Decimal(input.creditLimit)
  if (input.creditDays !== undefined) data.creditDays = input.creditDays
  if (input.notes !== undefined) data.notes = input.notes ?? null
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = await prisma.customer.update({ where: { id }, data })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: id,
      oldData: { name: existing.name, isActive: existing.isActive },
      newData: {
        name: updated.name,
        isActive: updated.isActive,
        creditLimit: decimalToNumber(updated.creditLimit),
      },
    },
  })
  return serialize(updated)
}

export async function deleteCustomer(id: string, actor: CustomerActor): Promise<void> {
  // Block delete if any financial dependency exists. Reversible deactivation
  // is the safe path; physical delete only when nothing references the row.
  const usage = await prisma.$transaction(async (tx) => {
    const salesCount = await tx.sale.count({ where: { customerId: id } })
    const prescriptionsCount = await tx.prescription.count({ where: { customerId: id } })
    const returnsCount = await tx.saleReturn.count({ where: { customerId: id } })
    const paymentsCount = await tx.payment.count({ where: { customerId: id } })
    const ledgerCount = await tx.customerLedger.count({ where: { customerId: id } })
    return { salesCount, prescriptionsCount, returnsCount, paymentsCount, ledgerCount }
  })
  const total = Object.values(usage).reduce((a, b) => a + b, 0)
  if (total > 0) {
    throw new Error(
      `Conflict: customer has ${total} linked records (sales/returns/payments/ledger/prescriptions). Deactivate instead of delete.`
    )
  }

  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: customer')

  await prisma.customer.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'DELETE',
      entity: 'Customer',
      entityId: id,
      oldData: { name: existing.name, email: existing.email },
    },
  })
}
