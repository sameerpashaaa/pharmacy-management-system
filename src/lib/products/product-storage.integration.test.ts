/**
 * @jest-environment node
 */
// Product storageCondition — Real Postgres integration tests
import type { StorageCondition } from '@prisma/client'

import prisma from '@/lib/db/prisma'
import { createProduct, getProductById, updateProduct } from '@/lib/products/product-service'
import { STORAGE_CONDITION_LABELS } from '@/lib/validations/product'

const HAS_DB = Boolean(process.env.DATABASE_URL)

const TBLS = [
  'product_barcodes',
  'product_categories',
  'products',
  'categories',
  'users',
  'branches',
  'organizations',
]

async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TBLS.join(', ')} RESTART IDENTITY CASCADE`)
}

const describeDb = HAS_DB ? describe : describe.skip

describeDb('Product storageCondition — integration', () => {
  let branchId: string
  let userId: string
  let categoryId: string

  beforeEach(async () => {
    await resetDb()
    const org = await prisma.organization.create({ data: { name: 'Test Org' } })
    const branch = await prisma.branch.create({
      data: { organizationId: org.id, name: 'Branch', code: 'B', invoicePrefix: 'INV' },
    })
    branchId = branch.id
    const user = await prisma.user.create({
      data: { name: 'Tester', email: 'tester@test.local', branchId },
    })
    userId = user.id
    const cat = await prisma.category.create({ data: { name: 'Test Cat', slug: 'test-cat' } })
    categoryId = cat.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('persists product with valid storageCondition', async () => {
    const p = await createProduct({
      name: 'Prod Valid',
      sku: 'STORAGE-001',
      mrp: 100,
      storageCondition: 'REFRIGERATED',
      createdById: userId,
      categoryIds: [categoryId],
    })
    expect(p.storageCondition).toBe('REFRIGERATED')
    const fetched = await getProductById(p.id)
    expect(fetched?.storageCondition).toBe('REFRIGERATED')
  })

  it('persists product without storageCondition as null', async () => {
    const p = await createProduct({
      name: 'Prod No Storage',
      sku: 'STORAGE-002',
      mrp: 100,
      createdById: userId,
      categoryIds: [categoryId],
    })
    expect(p.storageCondition).toBeNull()
  })

  it('persists product with explicit null', async () => {
    const p = await createProduct({
      name: 'Prod Null',
      sku: 'STORAGE-003',
      mrp: 100,
      storageCondition: null,
      createdById: userId,
      categoryIds: [categoryId],
    })
    expect(p.storageCondition).toBeNull()
  })

  it('update can set storageCondition', async () => {
    const p = await createProduct({
      name: 'Prod Upd',
      sku: 'STORAGE-004',
      mrp: 100,
      createdById: userId,
      categoryIds: [categoryId],
    })
    const updated = await updateProduct(p.id, { storageCondition: 'COOL' })
    expect(updated.storageCondition).toBe('COOL')
  })

  it('update can clear storageCondition', async () => {
    const p = await createProduct({
      name: 'Prod Clear',
      sku: 'STORAGE-005',
      mrp: 100,
      storageCondition: 'COOL',
      createdById: userId,
      categoryIds: [categoryId],
    })
    const updated = await updateProduct(p.id, { storageCondition: null })
    expect(updated.storageCondition).toBeNull()
  })

  it('accepts each of the five classifications', async () => {
    const values: Array<[string, string]> = Object.entries(STORAGE_CONDITION_LABELS)
    for (let i = 0; i < values.length; i++) {
      const [enumVal] = values[i]
      const p = await createProduct({
        name: `Prod ${enumVal}`,
        sku: `STORAGE-10${i}`,
        mrp: 100,
        storageCondition: enumVal as unknown as StorageCondition,
        createdById: userId,
        categoryIds: [categoryId],
      })
      expect(p.storageCondition).toBe(enumVal)
    }
  })

  it('existing products remain valid with null after migration', async () => {
    // Create without storageCondition, then fetch
    const p = await prisma.product.create({
      data: { name: 'Legacy', sku: 'LEGACY-001', mrp: 100, createdById: userId },
    })
    const fetched = await prisma.product.findUnique({ where: { id: p.id } })
    expect(fetched?.storageCondition).toBeNull()
  })
})
