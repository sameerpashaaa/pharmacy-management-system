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
    },
  ]

  for (const prod of sampleProducts) {
    const { categorySlug, ...productData } = prod
    const product = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: {},
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
  }

  console.log(`  ✓ ${sampleProducts.length} sample products seeded (${categories.length} categories)`)
}
