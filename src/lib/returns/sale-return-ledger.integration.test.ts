/**
 * @jest-environment node
 */
import prisma from '@/lib/db/prisma'
import { createSaleReturn } from '@/lib/returns/sale-return-service'

const HAS_DB = Boolean(process.env.DATABASE_URL)

;(HAS_DB ? describe : describe.skip)('Sale Return Ledger Integration', () => {
  let customerId: string
  let branchId: string
  let saleId: string
  let saleItemId: string
  let productId: string
  let batchId: string

  const actor = { id: 'test-actor-id', branchId: null }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `ledger-test-${Date.now()}@example.com`, name: 'Ledger Test User' },
    })
    actor.id = user.id

    // Setup org and branch
    const org = await prisma.organization.create({ data: { name: 'Ledger Org' } })
    const branch = await prisma.branch.create({
      data: { name: 'Ledger Branch', organizationId: org.id },
    })
    branchId = branch.id

    // Setup customer with an initial outstanding balance of 1000
    const customer = await prisma.customer.create({
      data: { name: 'Ledger Customer', outstandingBalance: 1000 },
    })
    customerId = customer.id

    // Setup product and inventory
    const product = await prisma.product.create({
      data: { name: 'Ledger Product', sku: `LP-${Date.now()}`, mrp: 100, createdById: actor.id },
    })
    productId = product.id

    await prisma.inventory.create({
      data: {
        branchId,
        productId,
        totalQuantity: 50,
        availableQuantity: 50,
      },
    })

    const batch = await prisma.batch.create({
      data: {
        branchId,
        productId,
        batchNumber: 'B-LEDGER-1',
        quantity: 50,
        expiryDate: new Date('2030-01-01'),
        mrp: 100,
        purchasePrice: 50,
      },
    })
    batchId = batch.id

    // Setup a sale
    const sale = await prisma.sale.create({
      data: {
        branchId,
        customerId,
        invoiceNumber: `INV-${Date.now()}`,
        subtotal: 500,
        totalAmount: 500,
        createdById: actor.id,
        saleDate: new Date(),
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId,
              productName: 'Ledger Product',
              productSku: `LP-SKU-${Date.now()}`,
              mrp: 100,
              quantity: 5,
              unitPrice: 100,
              totalAmount: 500,
              returnedQuantity: 0,
            },
          ],
        },
      },
      include: { items: true },
    })
    saleId = sale.id
    saleItemId = sale.items[0].id
  })

  afterAll(async () => {
    // Teardown is skipped as this is a test DB
  })

  it('updates the customer outstanding balance and sets ledger balance correctly when returning as CREDIT', async () => {
    // Customer starts with 1000 outstanding.
    // Return 2 items for 200 total as CREDIT.
    await createSaleReturn(
      {
        saleId,
        reason: 'Test ledger',
        refundMethod: 'CREDIT',
        items: [
          {
            saleItemId,
            quantity: 2,
            restockDecision: 'RESTOCK',
            batchId,
          },
        ],
      },
      actor
    )

    // Verify Customer balance
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
    })
    // Expected: 1000 - 200 = 800
    expect(updatedCustomer?.outstandingBalance.toNumber()).toBe(800)

    // Verify Ledger entry
    const ledger = await prisma.customerLedger.findFirst({
      where: { customerId, referenceType: 'SALE_RETURN' },
    })
    expect(ledger).toBeDefined()
    expect(ledger?.type).toBe('CREDIT')
    expect(ledger?.amount.toNumber()).toBe(200)
    expect(ledger?.balance.toNumber()).toBe(800)
  })
})
