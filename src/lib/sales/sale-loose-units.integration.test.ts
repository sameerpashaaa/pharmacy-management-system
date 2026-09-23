/**
 * @jest-environment node
 */
// ─────────────────────────────────────────────────────────────
// Loose-tab (C1) — POS sells strips + loose tabs from a strip-of-10 product.
//
// Pre-fix the server rejected any line with `looseUnits > 0` outright. These
// tests verify the full path: stock check, inventory deduction, SaleItem
// persistence and cancelSale restoration, all in strip-equivalent units.
// ─────────────────────────────────────────────────────────────
import { cancelSale, createSale, type CreateSaleCommand, type SaleActor } from '@/lib/sales/sales-service'
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
    ['pos', 'round_off_total', 'true'],
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
  branchA: string
  tabProductId: string
  bottleProductId: string
}

async function seed(): Promise<Fx> {
  const org1 = await prisma.organization.create({ data: { name: 'Org One' } })
  const branchA = await prisma.branch.create({
    data: { organizationId: org1.id, name: 'Branch A', code: 'A', invoicePrefix: 'INV' },
  })
  const userA = await prisma.user.create({
    data: { name: 'Alok', email: 'alok@pharma.test', branchId: branchA.id },
  })
  const tabProduct = await prisma.product.create({
    data: {
      name: 'Metformin 500mg',
      sku: 'MG-TAB',
      mrp: 100,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      createdById: userA.id,
    },
  })
  const bottleProduct = await prisma.product.create({
    data: {
      name: 'Cough Syrup 100ml',
      sku: 'MG-BTL',
      mrp: 80,
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      unitOfMeasure: 'Bottle',
      // No tabsPerStrip — must reject loose units
      createdById: userA.id,
    },
  })

  // Stock + an ACTIVE batch for each product (FEFO looks at batches).
  for (const p of [tabProduct, bottleProduct]) {
    await prisma.inventory.create({
      data: {
        productId: p.id,
        branchId: branchA.id,
        totalQuantity: 10,
        availableQuantity: 10,
      },
    })
    await prisma.batch.create({
      data: {
        productId: p.id,
        branchId: branchA.id,
        batchNumber: `B-${p.sku}`,
        quantity: 10,
        mrp: p.mrp,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        purchasePrice: p.mrp,
      },
    })
  }

  const actor: SaleActor = {
    id: userA.id,
    branchId: branchA.id,
    permissions: ['sales:create', 'sales:void'],
    roles: ['pharmacist'],
  }

  return {
    actor,
    branchA: branchA.id,
    tabProductId: tabProduct.id,
    bottleProductId: bottleProduct.id,
  }
}

const skipIfNoDb = HAS_DB ? describe : describe.skip

skipIfNoDb('createSale — loose-tab dispensing (C1)', () => {
  let fx: Fx

  beforeAll(async () => {
    await resetDb()
    await seedSystemSettings()
    fx = await seed()
  }, 60_000)

  it('sells 2 strips + 3 loose tabs and deducts 3 strips from inventory', async () => {
    const start = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    expect(start.availableQuantity).toBe(10)

    const cmd: CreateSaleCommand = {
      branchId: fx.branchA,
      items: [{ productId: fx.tabProductId, quantity: 2, looseUnits: 3 }],
      payments: [{ method: 'CASH', amount: 9999 }],
    }
    const sale = await createSale(cmd, fx.actor)

    const saleItem = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: sale.id, productId: fx.tabProductId },
    })
    expect(saleItem.quantity).toBe(2)
    expect(saleItem.looseUnits).toBe(3)
    expect(Number(saleItem.billedUnits)).toBeCloseTo(2.3, 5)
    expect(saleItem.totalBaseQty).toBe(23)

    const end = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    // stripsToDeduct = quantity + (looseUnits > 0 ? 1 : 0) = 3
    expect(start.availableQuantity - end.availableQuantity).toBe(3)
  }, 60_000)

  it('rejects loose units on a non-tab product', async () => {
    await expect(
      createSale(
        {
          branchId: fx.branchA,
          items: [{ productId: fx.bottleProductId, quantity: 1, looseUnits: 1 }],
          payments: [{ method: 'CASH', amount: 9999 }],
        },
        fx.actor
      )
    ).rejects.toThrow(/not packaged as tabs/)
  }, 30_000)

  it('rejects loose units equal to or greater than tabsPerStrip', async () => {
    await expect(
      createSale(
        {
          branchId: fx.branchA,
          items: [{ productId: fx.tabProductId, quantity: 1, looseUnits: 10 }],
          payments: [{ method: 'CASH', amount: 9999 }],
        },
        fx.actor
      )
    ).rejects.toThrow(/Invalid loose-tab line/)
  }, 30_000)

  it('rejects when stock cannot cover the extra strip for loose tabs', async () => {
    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    await prisma.inventory.update({
      where: { id: inv.id },
      data: { totalQuantity: 2, availableQuantity: 2 },
    })

    await expect(
      createSale(
        {
          branchId: fx.branchA,
          items: [{ productId: fx.tabProductId, quantity: 2, looseUnits: 3 }],
          payments: [{ method: 'CASH', amount: 9999 }],
        },
        fx.actor
      )
    ).rejects.toThrow(/Insufficient available stock/)
  }, 30_000)

  it('cancelSale restores the strip-equivalent count (2 strips + 3 loose tabs → +3 strips)', async () => {
    // Reset to 10 strips so the test starts deterministically.
    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    await prisma.inventory.update({
      where: { id: inv.id },
      data: { totalQuantity: 10, availableQuantity: 10 },
    })

    const before = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })

    const sale = await createSale(
      {
        branchId: fx.branchA,
        items: [{ productId: fx.tabProductId, quantity: 2, looseUnits: 3 }],
        payments: [{ method: 'CASH', amount: 9999 }],
      },
      fx.actor
    )
    const during = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    expect(before.availableQuantity - during.availableQuantity).toBe(3)

    await cancelSale(sale.id, 'test cancel', fx.actor)
    const after = await prisma.inventory.findUniqueOrThrow({
      where: { productId_branchId: { productId: fx.tabProductId, branchId: fx.branchA } },
    })
    expect(after.availableQuantity).toBe(before.availableQuantity)
  }, 60_000)
})
