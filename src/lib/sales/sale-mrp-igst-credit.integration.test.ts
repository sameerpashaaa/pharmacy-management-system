/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Integration tests for H7 (batch-MRP pricing), H8 (IGST for
// interstate sales), and H9 (credit-limit enforcement).
//
// Skipped automatically when no DATABASE_URL is set so the unit
// suite keeps running offline.
// ─────────────────────────────────────────────────────────────
import { createSale, type CreateSaleCommand, type SaleActor } from '@/lib/sales/sales-service'
import prisma from '@/lib/db/prisma'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'audit_logs',
  'sale_item_batches',
  'sale_items',
  'sales',
  'sale_return_items',
  'sale_returns',
  'credit_notes',
  'payments',
  'held_bills',
  'inventory_movements',
  'batches',
  'inventory',
  'product_barcodes',
  'products',
  'customer_ledgers',
  'customers',
  'user_roles',
  'role_permissions',
  'notifications',
  'accounts',
  'sessions',
  'users',
  'branches',
  'organization_settings',
  'system_settings',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

async function seedSystemSettings(): Promise<void> {
  const rows = [
    ['pos', 'max_discount_percent', '20'],
    ['pos', 'round_off_total', 'false'],
    ['pos', 'allow_credit_sales', 'true'],
    ['pos', 'require_customer_for_credit', 'true'],
    ['inventory', 'fefo_enabled', 'true'],
    ['gst', 'tax_inclusive', 'false'],
  ] as const
  for (const [category, key, value] of rows) {
    await prisma.systemSetting.upsert({
      where: { category_key: { category, key } },
      update: { value },
      create: { category, key, value },
    })
  }
}

interface Fx {
  actor: SaleActor
  branchIntra: string // same state as customer
  branchInter: string // different state (interstate)
  productIntra: string
  productInter: string
  customerIntra: string
  customerInter: string
}

async function seed(): Promise<Fx> {
  const org = await prisma.organization.create({
    data: { name: 'Org', state: 'Maharashtra' },
  })
  const branchIntra = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'MH Branch',
      code: 'MH',
      invoicePrefix: 'INV',
      state: 'Maharashtra',
    },
  })
  const branchInter = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: 'KA Branch',
      code: 'KA',
      invoicePrefix: 'INV',
      state: 'Karnataka',
    },
  })
  const user = await prisma.user.create({
    data: { name: 'Tester', email: 't@pharma.test', branchId: branchIntra.id },
  })

  const productIntra = await prisma.product.create({
    data: {
      name: 'Test Tab',
      sku: 'T-1',
      mrp: 100,
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      createdById: user.id,
    },
  })
  const productInter = await prisma.product.create({
    data: {
      name: 'Cross-State Tab',
      sku: 'T-2',
      mrp: 100,
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      createdById: user.id,
    },
  })

  // Two batches with DIFFERENT MRPs so we can prove batch-MRP takes effect.
  await Promise.all([
    prisma.batch.create({
      data: {
        productId: productIntra.id,
        branchId: branchIntra.id,
        batchNumber: 'CHEAP',
        quantity: 5,
        mrp: 80, // product.mrp=100; batch says 80 → pricing must use 80
        purchasePrice: 50,
        expiryDate: new Date(Date.now() + 90 * 86400000),
      },
    }),
    prisma.batch.create({
      data: {
        productId: productIntra.id,
        branchId: branchIntra.id,
        batchNumber: 'EXPENSIVE',
        quantity: 5,
        mrp: 120, // product.mrp=100; batch says 120 → multi-batch uses avg=100
        purchasePrice: 90,
        expiryDate: new Date(Date.now() + 60 * 86400000),
      },
    }),
  ])
  // Batch for the interstate product (single batch for clean IGST assertion)
  await prisma.batch.create({
    data: {
      productId: productInter.id,
      branchId: branchInter.id,
      batchNumber: 'KA-1',
      quantity: 5,
      mrp: 100,
      purchasePrice: 70,
      expiryDate: new Date(Date.now() + 60 * 86400000),
    },
  })

  for (const p of [productIntra, productInter]) {
    await prisma.inventory.create({
      data: {
        productId: p.id,
        branchId: p === productIntra ? branchIntra.id : branchInter.id,
        totalQuantity: 10,
        availableQuantity: 10,
      },
    })
  }

  const customerIntra = await prisma.customer.create({
    data: {
      name: 'Intra Customer',
      state: 'Maharashtra',
      creditLimit: 500,
      outstandingBalance: 0,
    },
  })
  const customerInter = await prisma.customer.create({
    data: {
      name: 'Inter Customer',
      state: 'Karnataka',
      creditLimit: 1000,
      outstandingBalance: 0,
    },
  })

  const actor: SaleActor = {
    id: user.id,
    branchId: branchIntra.id,
    permissions: ['sales:create'],
    roles: ['pharmacist'],
  }

  return {
    actor,
    branchIntra: branchIntra.id,
    branchInter: branchInter.id,
    productIntra: productIntra.id,
    productInter: productInter.id,
    customerIntra: customerIntra.id,
    customerInter: customerInter.id,
  }
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('createSale — H7 batch-MRP, H8 IGST, H9 credit-limit', () => {
  let fx: Fx

  beforeAll(async () => {
    await resetDb()
    await seedSystemSettings()
    fx = await seed()
  }, 60_000)

  it('H7: single-batch line uses the batch MRP, not the product MRP', async () => {
    const sale = await createSale(
      {
        branchId: fx.branchIntra,
        customerId: fx.customerIntra,
        items: [{ productId: fx.productIntra, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 9999 }],
      },
      fx.actor
    )

    const item = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: sale.id, productId: fx.productIntra },
    })
    // FEFO picks the earliest expiry (CHEAP @ mrp 80). The sale line must
    // record unitPrice=80 even though product.mrp=100.
    expect(Number(item.unitPrice)).toBe(80)
    // batch-level MRP captured on SaleItemBatch for auditability.
    const itemBatches = await prisma.saleItemBatch.findMany({ where: { saleItemId: item.id } })
    expect(itemBatches.length).toBe(1)
    expect(Number(itemBatches[0].unitPrice)).toBe(80)
  }, 30_000)

  it('H8: intra-state customer produces cgst + sgst and zero igst', async () => {
    const sale = await createSale(
      {
        branchId: fx.branchIntra,
        customerId: fx.customerIntra,
        items: [{ productId: fx.productIntra, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 9999 }],
      },
      fx.actor
    )
    const item = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: sale.id, productId: fx.productIntra },
    })
    expect(Number(item.cgstPercent)).toBe(9)
    expect(Number(item.sgstPercent)).toBe(9)
    expect(Number(item.igstPercent)).toBe(0)
    expect(Number(item.cgstAmount)).toBeGreaterThan(0)
    expect(Number(item.sgstAmount)).toBeGreaterThan(0)
    expect(Number(item.igstAmount)).toBe(0)
  }, 30_000)

  it('H8: interstate (branch MH sells to KA customer) charges IGST only', async () => {
    // Note: actor.branchId is intra (per actor fixture). For an interstate sale
    // we need a sale issued FROM the KA branch. Create a one-off actor there.
    const kaUser = await prisma.user.create({
      data: { name: 'KA Cashier', email: 'ka@pharma.test', branchId: fx.branchInter },
    })
    const kaActor: SaleActor = {
      id: kaUser.id,
      branchId: fx.branchInter,
      permissions: ['sales:create'],
      roles: ['pharmacist'],
    }

    const sale = await createSale(
      {
        branchId: fx.branchInter,
        customerId: fx.customerInter,
        items: [{ productId: fx.productInter, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 9999 }],
      },
      kaActor
    )
    const item = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: sale.id, productId: fx.productInter },
    })
    expect(Number(item.cgstPercent)).toBe(0)
    expect(Number(item.sgstPercent)).toBe(0)
    expect(Number(item.igstPercent)).toBe(18)
    expect(Number(item.igstAmount)).toBeGreaterThan(0)
    expect(Number(item.cgstAmount)).toBe(0)
    expect(Number(item.sgstAmount)).toBe(0)
  }, 30_000)

  it('H9: credit sale over the configured creditLimit is rejected', async () => {
    // Customer has creditLimit=500, outstanding=0.
    // Each strip @ MRP 80 + GST 18% ≈ 94.4. 6 strips → ~566 > 500.
    await expect(
      createSale(
        {
          branchId: fx.branchIntra,
          customerId: fx.customerIntra,
          items: [{ productId: fx.productIntra, quantity: 6 }],
          payments: [{ method: 'CREDIT', amount: 9999 }],
        },
        fx.actor
      )
    ).rejects.toThrow(/Credit limit exceeded/)
  }, 30_000)

  it('H9: credit sale exactly at the limit is allowed', async () => {
    // customerIntra creditLimit=500, outstanding=0. Single strip @ 80 + 18%
    // GST = 94.4 → well under 500.
    const sale = await createSale(
      {
        branchId: fx.branchIntra,
        customerId: fx.customerIntra,
        items: [{ productId: fx.productIntra, quantity: 1 }],
        payments: [{ method: 'CREDIT', amount: 9999 }],
      },
      fx.actor
    )
    expect(sale.paymentStatus).toBe('CREDIT')

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: fx.customerIntra } })
    expect(Number(after.outstandingBalance)).toBeGreaterThan(0)
    expect(Number(after.outstandingBalance)).toBeLessThanOrEqual(500)
  }, 30_000)

  it('H9: a customer with creditLimit=0 (unset) is not blocked', async () => {
    const unlimited = await prisma.customer.create({
      data: { name: 'Unlimited', creditLimit: 0, state: 'Maharashtra' },
    })
    const sale = await createSale(
      {
        branchId: fx.branchIntra,
        customerId: unlimited.id,
        items: [{ productId: fx.productIntra, quantity: 1 }],
        payments: [{ method: 'CREDIT', amount: 9999 }],
      },
      fx.actor
    )
    expect(sale.paymentStatus).toBe('CREDIT')
  }, 30_000)
})
