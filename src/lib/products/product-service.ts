// ─────────────────────────────────────────────────────────────
// Product Master Service
// ─────────────────────────────────────────────────────────────
import type { Prisma, Product, Category, ProductBarcode, HsnCode } from '@prisma/client'

import prisma from '@/lib/db/prisma'

// ─── Types ────────────────────────────────────────────────────

export interface ProductWithRelations extends Product {
  categories: { category: Category }[]
  barcodes: ProductBarcode[]
  hsnCodeRef: HsnCode | null
  createdBy?: { id: string; name: string } | null
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
  productCount: number
}

export interface ProductListParams {
  page?: number
  limit?: number
  search?: string
  categoryId?: string
  isActive?: boolean
  sortBy?: 'name' | 'sku' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export interface ProductListResult {
  data: ProductWithRelations[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

// ─── Category Service ────────────────────────────────────────

export async function getCategories(params?: {
  parentId?: string | null
  isActive?: boolean
  includeChildren?: boolean
}): Promise<Category[]> {
  const { parentId, isActive, includeChildren } = params ?? {}

  return prisma.category.findMany({
    where: {
      parentId: parentId ?? undefined,
      isActive: isActive ?? undefined,
    },
    include: {
      children: includeChildren
        ? {
            where: { isActive: isActive ?? undefined },
            orderBy: { sortOrder: 'asc' },
          }
        : false,
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const [categories, countRows] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.productCategory.groupBy({
      by: ['categoryId'],
      where: { product: { isActive: true } },
      _count: { _all: true },
    }),
  ])

  const productCounts = new Map(countRows.map((c) => [c.categoryId, c._count._all]))

  const byParent = new Map<string | null, CategoryNode[]>()
  for (const category of categories) {
    const node: CategoryNode = {
      ...category,
      children: [],
      productCount: productCounts.get(category.id) ?? 0,
    }
    const list = byParent.get(category.parentId) ?? []
    list.push(node)
    byParent.set(category.parentId, list)
  }

  const build = (parentId: string | null): CategoryNode[] =>
    (byParent.get(parentId) ?? []).map((node) => ({
      ...node,
      children: build(node.id),
    }))

  return build(null)
}

export async function getCategoryById(id: string): Promise<Category | null> {
  return prisma.category.findUnique({
    where: { id },
    include: {
      parent: true,
      children: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { products: true } },
    },
  })
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return prisma.category.findUnique({
    where: { slug },
    include: {
      parent: true,
      children: { orderBy: { sortOrder: 'asc' } },
    },
  })
}

export async function createCategory(data: Prisma.CategoryUncheckedCreateInput): Promise<Category> {
  return prisma.category.create({ data })
}

export async function updateCategory(
  id: string,
  data: Prisma.CategoryUncheckedUpdateInput
): Promise<Category> {
  return prisma.category.update({ where: { id }, data })
}

export async function deleteCategory(id: string): Promise<Category> {
  // Soft delete - mark inactive
  return prisma.category.update({
    where: { id },
    data: { isActive: false },
  })
}

export async function getCategoryOptions(): Promise<
  { id: string; name: string; slug: string; parentId: string | null }[]
> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return categories
}

// ─── HSN Code Service ────────────────────────────────────────

export async function getHsnCodes(): Promise<HsnCode[]> {
  return prisma.hsnCode.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
}

export async function getHsnCodeByCode(code: string): Promise<HsnCode | null> {
  return prisma.hsnCode.findUnique({ where: { code } })
}

// ─── Product Service ────────────────────────────────────────

export async function getProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  const {
    page = 1,
    limit = 20,
    search,
    categoryId,
    isActive,
    sortBy = 'name',
    sortOrder = 'asc',
  } = params

  const skip = (page - 1) * limit

  const where: Prisma.ProductWhereInput = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { genericName: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      { manufacturer: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (categoryId) {
    where.categories = {
      some: { categoryId },
    }
  }

  if (isActive !== undefined) {
    where.isActive = isActive
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        categories: { include: { category: true } },
        barcodes: true,
        hsnCodeRef: true,
      },
    }),
    prisma.product.count({ where }),
  ])

  return {
    data: products as ProductWithRelations[],
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

export async function getProductById(id: string): Promise<ProductWithRelations | null> {
  return prisma.product.findUnique({
    where: { id },
    include: {
      categories: { include: { category: true } },
      barcodes: true,
      hsnCodeRef: true,
      createdBy: { select: { id: true, name: true } },
    },
  }) as Promise<ProductWithRelations | null>
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  return prisma.product.findUnique({ where: { sku } })
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  // Check primary barcode
  const primaryProduct = await prisma.product.findUnique({ where: { barcode } })
  if (primaryProduct) return primaryProduct

  // Check additional barcodes
  const productBarcode = await prisma.productBarcode.findUnique({
    where: { barcode },
    include: { product: true },
  })
  return productBarcode?.product ?? null
}

export async function createProduct(
  data: Prisma.ProductUncheckedCreateInput & {
    categoryIds?: string[]
    barcodes?: { barcode: string; type?: string; isPrimary?: boolean }[]
  }
): Promise<ProductWithRelations> {
  const { categoryIds, barcodes, ...productData } = data

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: productData })

    // Link categories
    if (categoryIds && categoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          productId: product.id,
          categoryId,
        })),
        skipDuplicates: true,
      })
    }

    // Create additional barcodes
    if (barcodes && barcodes.length > 0) {
      await tx.productBarcode.createMany({
        data: barcodes.map((bc) => ({
          productId: product.id,
          barcode: bc.barcode,
          type: bc.type ?? 'EAN13',
          isPrimary: bc.isPrimary ?? false,
        })),
        skipDuplicates: true,
      })
    }

    // Return with relations
    return tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        categories: { include: { category: true } },
        barcodes: true,
        hsnCodeRef: true,
      },
    })
  })
}

export async function updateProduct(
  id: string,
  data: Prisma.ProductUncheckedUpdateInput & {
    categoryIds?: string[]
    barcodes?: { barcode: string; type?: string; isPrimary?: boolean }[]
  }
): Promise<ProductWithRelations> {
  const { categoryIds, barcodes, ...productData } = data

  return prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: productData,
    })

    // Update categories if provided
    if (categoryIds !== undefined) {
      await tx.productCategory.deleteMany({ where: { productId: id } })
      if (categoryIds.length > 0) {
        await tx.productCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            productId: id,
            categoryId,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Update barcodes if provided
    if (barcodes !== undefined) {
      await tx.productBarcode.deleteMany({ where: { productId: id } })
      if (barcodes.length > 0) {
        await tx.productBarcode.createMany({
          data: barcodes.map((bc) => ({
            productId: id,
            barcode: bc.barcode,
            type: bc.type ?? 'EAN13',
            isPrimary: bc.isPrimary ?? false,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Return with relations
    return tx.product.findUniqueOrThrow({
      where: { id },
      include: {
        categories: { include: { category: true } },
        barcodes: true,
        hsnCodeRef: true,
      },
    })
  })
}

export async function deleteProduct(id: string): Promise<Product> {
  // Soft delete - mark inactive
  return prisma.product.update({
    where: { id },
    data: { isActive: false },
  })
}

export async function toggleProductActive(id: string, isActive: boolean): Promise<Product> {
  return prisma.product.update({
    where: { id },
    data: { isActive },
  })
}

export async function checkSkuExists(sku: string, excludeId?: string): Promise<boolean> {
  const product = await prisma.product.findUnique({ where: { sku } })
  return !!product && product.id !== excludeId
}

export async function checkBarcodeExists(barcode: string, excludeId?: string): Promise<boolean> {
  const [product, productBarcode] = await Promise.all([
    prisma.product.findUnique({ where: { barcode } }),
    prisma.productBarcode.findUnique({ where: { barcode } }),
  ])
  return (
    (!!product && product.id !== excludeId) ||
    (!!productBarcode && productBarcode.productId !== excludeId)
  )
}
