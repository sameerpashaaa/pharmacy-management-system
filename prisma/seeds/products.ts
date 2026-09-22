import type { PrismaClient } from '@prisma/client'

export async function seedProducts(prisma: PrismaClient) {
  // Create categories first
  const categories = [
    { name: 'Tablets', slug: 'tablets' },
    { name: 'Capsules', slug: 'capsules' },
    { name: 'Syrups & Liquids', slug: 'syrups-liquids' },
    { name: 'Injections', slug: 'injections' },
    { name: 'Topical / Ointments', slug: 'topical-ointments' },
    { name: 'Eye & Ear Drops', slug: 'eye-ear-drops' },
    { name: 'Surgical & Accessories', slug: 'surgical-accessories' },
    { name: 'Vitamins & Supplements', slug: 'vitamins-supplements' },
    { name: 'Diabetic Care', slug: 'diabetic-care' },
    { name: 'Baby Care', slug: 'baby-care' },
  ]

  const categoryMap: Record<string, string> = {}
  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { name: cat.name, slug: cat.slug, isActive: true },
    })
    categoryMap[cat.slug] = created.id
  }

  // Get admin user for createdById
  const admin = await prisma.user.findFirst({ where: { email: 'admin@pharmacare.local' } })
  if (!admin) return

  // Get or verify default branch
  let branch = await prisma.branch.findFirst({ where: { id: 'default-branch' } })
  if (!branch) {
    branch = await prisma.branch.findFirst()
  }
  if (!branch) return

  // 1. Create a Wall
  const wall = await prisma.wall.upsert({
    where: { branchId_code: { branchId: branch.id, code: 'W1' } },
    update: {},
    create: {
      branchId: branch.id,
      code: 'W1',
      name: 'Main Wall 1',
      description: 'Primary storage wall for medicines',
      wallType: 'OPEN',
      sortOrder: 1,
    },
  })

  // 2. Create 4 Racks on this Wall
  const racksData = [
    { code: 'R1', name: 'Rack 1', desc: 'Rack for general tablets & analgesics' },
    { code: 'R2', name: 'Rack 2', desc: 'Rack for antibiotics & anti-inflammatories' },
    { code: 'R3', name: 'Rack 3', desc: 'Rack for syrups & respiratory care' },
    { code: 'R4', name: 'Rack 4', desc: 'Rack for vitamins & supplements' },
  ]

  const rackBins: { rackId: string; binId: string }[] = []

  for (let i = 0; i < racksData.length; i++) {
    const r = racksData[i]
    const rack = await prisma.rack.upsert({
      where: { wallId_code: { wallId: wall.id, code: r.code } },
      update: {},
      create: {
        wallId: wall.id,
        code: r.code,
        name: r.name,
        description: r.desc,
        sortOrder: i + 1,
      },
    })

    const shelf = await prisma.rackShelf.upsert({
      where: { rackId_level: { rackId: rack.id, level: 1 } },
      update: {},
      create: {
        rackId: rack.id,
        level: 1,
        label: 'Shelf 1',
        description: 'Level 1 shelf',
      },
    })

    const bin = await prisma.storeBin.upsert({
      where: { shelfId_binCode: { shelfId: shelf.id, binCode: 'B1' } },
      update: { fullAddress: `Rack-${i + 1}` },
      create: {
        shelfId: shelf.id,
        binCode: 'B1',
        fullAddress: `Rack-${i + 1}`,
        capacity: 500,
      },
    })

    rackBins.push({ rackId: rack.id, binId: bin.id })
  }

  // 3. Sample dummy medical products assigned across the 4 racks
  const sampleProducts = [
    {
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      sku: 'PCM-500',
      barcode: '8901234567890',
      manufacturer: 'Generic Pharma',
      composition: 'Paracetamol 500mg',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 25.00,
      ptr: 20.00,
      costPrice: 15.00,
      minStockLevel: 50,
      reorderLevel: 100,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      categorySlug: 'tablets',
      rackIndex: 0,
    },
    {
      name: 'Amoxicillin 500mg',
      genericName: 'Amoxicillin',
      sku: 'AMX-500',
      barcode: '8901234567891',
      manufacturer: 'Generic Pharma',
      composition: 'Amoxicillin 500mg',
      drugSchedule: 'H' as const,
      isPrescriptionRequired: true,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 85.00,
      ptr: 68.00,
      costPrice: 55.00,
      minStockLevel: 20,
      reorderLevel: 50,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      categorySlug: 'tablets',
      rackIndex: 1,
    },
    {
      name: 'Cough Syrup 100ml',
      genericName: 'Dextromethorphan + Phenylephrine',
      sku: 'CFS-100',
      barcode: '8901234567892',
      manufacturer: 'Generic Pharma',
      composition: 'Dextromethorphan 10mg + Phenylephrine 5mg per 5ml',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 65.00,
      ptr: 52.00,
      costPrice: 40.00,
      minStockLevel: 30,
      reorderLevel: 60,
      unitOfMeasure: 'Bottle',
      categorySlug: 'syrups-liquids',
      rackIndex: 2,
    },
    {
      name: 'Vitamin C 500mg',
      genericName: 'Ascorbic Acid',
      sku: 'VTC-500',
      barcode: '8901234567893',
      manufacturer: 'Health Corp',
      composition: 'Ascorbic Acid 500mg',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '2106',
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18,
      mrp: 120.00,
      ptr: 96.00,
      costPrice: 75.00,
      minStockLevel: 30,
      reorderLevel: 60,
      unitOfMeasure: 'Bottle',
      tabsPerStrip: 60,
      categorySlug: 'vitamins-supplements',
      rackIndex: 3,
    },
    {
      name: 'Betadine Ointment 20g',
      genericName: 'Povidone-Iodine',
      sku: 'BET-OIN-20',
      barcode: '8901234567894',
      manufacturer: 'Win Medicare',
      composition: 'Povidone-Iodine 5% w/w',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 55.00,
      ptr: 44.00,
      costPrice: 35.00,
      minStockLevel: 20,
      reorderLevel: 40,
      unitOfMeasure: 'Tube',
      categorySlug: 'topical-ointments',
      rackIndex: 0,
    },
    {
      name: 'Ibuprofen 400mg',
      genericName: 'Ibuprofen',
      sku: 'IBU-400',
      barcode: '8901234567895',
      manufacturer: 'Generic Pharma',
      composition: 'Ibuprofen 400mg',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 38.00,
      ptr: 30.00,
      costPrice: 22.00,
      minStockLevel: 25,
      reorderLevel: 50,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      categorySlug: 'tablets',
      rackIndex: 1,
    },
    {
      name: 'Cetirizine 10mg',
      genericName: 'Cetirizine Hydrochloride',
      sku: 'CET-10',
      barcode: '8901234567896',
      manufacturer: 'Generic Pharma',
      composition: 'Cetirizine 10mg',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 32.00,
      ptr: 25.00,
      costPrice: 18.00,
      minStockLevel: 25,
      reorderLevel: 50,
      unitOfMeasure: 'Strip',
      tabsPerStrip: 10,
      categorySlug: 'tablets',
      rackIndex: 2,
    },
    {
      name: 'Digene Antacid Gel 200ml',
      genericName: 'Magnesium Hydroxide + Aluminium Hydroxide',
      sku: 'DIG-200',
      barcode: '8901234567897',
      manufacturer: 'Abbott',
      composition: 'Antacid & Antigas Gel 200ml',
      drugSchedule: 'NONE' as const,
      isPrescriptionRequired: false,
      hsnCode: '3004',
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 12,
      mrp: 145.00,
      ptr: 116.00,
      costPrice: 90.00,
      minStockLevel: 15,
      reorderLevel: 30,
      unitOfMeasure: 'Bottle',
      categorySlug: 'syrups-liquids',
      rackIndex: 3,
    },
  ]

  for (const prod of sampleProducts) {
    const { categorySlug, rackIndex, ...productData } = prod
    const loc = rackBins[rackIndex]

    const product = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: {
        rackId: loc.rackId,
        primaryBinId: loc.binId,
      },
      create: {
        ...productData,
        mrp: productData.mrp,
        ptr: productData.ptr,
        costPrice: productData.costPrice,
        gstRate: productData.gstRate,
        cgstRate: productData.cgstRate,
        sgstRate: productData.sgstRate,
        igstRate: productData.igstRate,
        createdById: admin.id,
        rackId: loc.rackId,
        primaryBinId: loc.binId,
      },
    })

    // Link category
    const categoryId = categoryMap[categorySlug]
    if (categoryId) {
      await prisma.productCategory.upsert({
        where: { productId_categoryId: { productId: product.id, categoryId } },
        update: {},
        create: { productId: product.id, categoryId },
      })
    }

    // Upsert Inventory with availableQuantity so POS shows stock
    await prisma.inventory.upsert({
      where: {
        productId_branchId: { productId: product.id, branchId: branch.id },
      },
      update: {
        totalQuantity: 100,
        availableQuantity: 100,
        reservedQuantity: 0,
      },
      create: {
        productId: product.id,
        branchId: branch.id,
        totalQuantity: 100,
        availableQuantity: 100,
        reservedQuantity: 0,
      },
    })

    // Upsert Batch
    const batchNumber = `${productData.sku}-B1`
    const batch = await prisma.batch.upsert({
      where: {
        productId_batchNumber: { productId: product.id, batchNumber },
      },
      update: {
        quantity: 100,
        branchId: branch.id,
      },
      create: {
        productId: product.id,
        batchNumber,
        manufacturingDate: new Date('2024-01-01'),
        expiryDate: new Date('2026-12-31'),
        purchasePrice: productData.costPrice,
        mrp: productData.mrp,
        quantity: 100,
        branchId: branch.id,
      },
    })

    // Link BinStock
    await prisma.binStock.upsert({
      where: {
        id: `${loc.binId}_${product.id}`,
      },
      update: {
        quantity: 100,
      },
      create: {
        id: `${loc.binId}_${product.id}`,
        binId: loc.binId,
        productId: product.id,
        batchId: batch.id,
        quantity: 100,
      },
    })
  }

  // eslint-disable-next-line no-console
  console.log(`  ✓ ${sampleProducts.length} sample products seeded with 4 racks and stock!`)
}
