import type { Customer, Prisma } from '@prisma/client'
import type { z } from 'zod'

import prisma from '@/lib/db/prisma'
import { type AuthUser } from '@/lib/inventory/branch-access'
import { customerListQuerySchema, type CustomerFormValues } from '@/lib/validations/customer'

export interface CustomerWithLedger extends Customer {
  ledgerEntries: {
    id: string
    type: 'DEBIT' | 'CREDIT'
    amount: Prisma.Decimal
    balance: Prisma.Decimal
    description: string
    entryDate: Date
  }[]
}

export async function createCustomer(data: CustomerFormValues, actor: AuthUser): Promise<Customer> {
  const customer = await prisma.customer.create({
    data: {
      ...data,
      creditDays: data.creditDays ?? 0,
      creditLimit: data.creditLimit ?? 0,
      outstandingBalance: 0,
      isActive: data.isActive ?? true,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'CUSTOMER_CREATE',
      entity: 'Customer',
      entityId: customer.id,
      metadata: { name: customer.name },
    },
  })

  return customer
}

export async function getCustomer(id: string, _actor: AuthUser): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { id } })
}

export async function updateCustomer(
  id: string,
  data: Partial<CustomerFormValues>,
  actor: AuthUser
): Promise<Customer> {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new Error('Not Found: customer')

  const customer = await prisma.customer.update({
    where: { id },
    data,
  })

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'CUSTOMER_UPDATE',
      entity: 'Customer',
      entityId: id,
      metadata: { changes: data },
    },
  })

  return customer
}

export async function listCustomers(
  params: z.infer<typeof customerListQuerySchema>,
  _actor: AuthUser
): Promise<{
  data: Customer[]
  pagination: { page: number; limit: number; total: number; pages: number }
}> {
  const { page = 1, limit = 20, search } = customerListQuerySchema.parse(params)

  const where: Prisma.CustomerWhereInput = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const orderBy: Prisma.CustomerOrderByWithRelationInput = { name: 'asc' }
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take: limit, orderBy }),
    prisma.customer.count({ where }),
  ])

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}
