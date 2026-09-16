/**
 * @jest-environment node
 */
/* eslint-disable */
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals'

import prisma from '@/lib/db/prisma'
import { getGstr1Report } from './gst-service'
import type { AuthUser } from '@/lib/inventory/branch-access'

describe('GSTR-1 Report (Real Postgres)', () => {
  let actor: AuthUser
  let branchId: string
  let orgId: string

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'GSTR1 Org' } })
    orgId = org.id
    const branch = await prisma.branch.create({
      data: { name: 'GSTR1 Branch', organizationId: org.id },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: { name: 'GSTR1 User', email: `gstr1-${Date.now()}@example.com`, branchId },
    })
    actor = { id: user.id, branchId: branch.id, role: 'ADMIN' } as AuthUser

    // Seed 105 B2B and 105 B2C transactions
    const txs = []
    for (let i = 0; i < 105; i++) {
      txs.push({
        branchId,
        type: 'B2B' as const,
        referenceType: 'SALE' as const,
        referenceId: `sale-b2b-${i}`,
        referenceLineId: `line-b2b-${i}`,
        invoiceNumber: `INV-B2B-${i}`,
        invoiceDate: new Date(),
        returnPeriod: '09-2026',
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        totalTax: 18,
        totalAmount: 118,
      })
      txs.push({
        branchId,
        type: 'B2C' as const,
        referenceType: 'SALE' as const,
        referenceId: `sale-b2c-${i}`,
        referenceLineId: `line-b2c-${i}`,
        invoiceNumber: `INV-B2C-${i}`,
        invoiceDate: new Date(),
        returnPeriod: '09-2026',
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        totalTax: 18,
        totalAmount: 118,
      })
    }
    await prisma.gstTransaction.createMany({ data: txs })
  })

  afterAll(async () => {
    // cleanup
    await prisma.gstTransaction.deleteMany({ where: { branchId } })
    await prisma.user.delete({ where: { id: actor.id } })
    await prisma.branch.delete({ where: { id: branchId } })
    await prisma.organization.delete({ where: { id: orgId } })
  })

  it('does not artificially limit B2B or B2C rows to 100', async () => {
    const report = await getGstr1Report({ branchId, returnPeriod: '09-2026' }, actor)
    expect(report.b2b.length).toBe(105)
    expect(report.b2c.length).toBe(105)
  })
})
