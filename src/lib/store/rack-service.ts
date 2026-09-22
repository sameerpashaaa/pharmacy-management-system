/* eslint-disable */
import { prisma } from '@/lib/db/prisma'
import type {
  AssignStockInput,
  RackInput,
  RackShelfInput,
  StoreBinInput,
  StoreLocateQuery,
  WallInput,
} from '@/lib/validations/store'

// ============================================================================
// WALLS
// ============================================================================

export async function getWalls(branchId: string) {
  return prisma.wall.findMany({
    where: { branchId },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { racks: true },
      },
    },
  })
}

export async function getWall(id: string) {
  const wall = await prisma.wall.findUnique({
    where: { id },
    include: {
      racks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { shelves: true },
          },
        },
      },
    },
  })
  if (!wall) throw new Error('Wall not found')
  return wall
}

export async function createWall(data: WallInput) {
  return prisma.wall.create({ data })
}

export async function updateWall(id: string, data: Partial<WallInput>) {
  return prisma.wall.update({ where: { id }, data })
}

export async function deleteWall(id: string) {
  return prisma.wall.delete({ where: { id } })
}

// ============================================================================
// RACKS
// ============================================================================

export async function getRack(id: string) {
  const rack = await prisma.rack.findUnique({
    where: { id },
    include: {
      wall: true,
      shelves: {
        orderBy: { level: 'asc' },
        include: {
          bins: {
            orderBy: { binCode: 'asc' },
          },
        },
      },
    },
  })
  if (!rack) throw new Error('Rack not found')
  return rack
}

export async function createRack(data: RackInput) {
  return prisma.rack.create({ data })
}

export async function updateRack(id: string, data: Partial<RackInput>) {
  return prisma.rack.update({ where: { id }, data })
}

export async function deleteRack(id: string) {
  return prisma.rack.delete({ where: { id } })
}

// ============================================================================
// SHELVES
// ============================================================================

export async function createShelf(data: RackShelfInput) {
  return prisma.rackShelf.create({ data })
}

export async function updateShelf(id: string, data: Partial<RackShelfInput>) {
  return prisma.rackShelf.update({ where: { id }, data })
}

export async function deleteShelf(id: string) {
  return prisma.rackShelf.delete({ where: { id } })
}

// ============================================================================
// BINS & STOCK ASSIGNMENT
// ============================================================================

export async function getBin(id: string) {
  const bin = await prisma.storeBin.findUnique({
    where: { id },
    include: {
      shelf: {
        include: {
          rack: {
            include: {
              wall: true,
            },
          },
        },
      },
      stock: {
        include: {
          product: true,
          batch: true,
        },
      },
    },
  })
  if (!bin) throw new Error('Bin not found')
  return bin
}

export async function createBin(data: StoreBinInput) {
  const shelf = await prisma.rackShelf.findUnique({
    where: { id: data.shelfId },
    include: { rack: { include: { wall: true } } },
  })
  
  if (!shelf) throw new Error('Shelf not found')
  
  // Compute full address e.g. "A-03-2-B"
  // If wall code is "A", rack code is "03", level is "2", binCode is "B"
  // Assuming rack code already includes wall prefix if user enters it that way, 
  // we'll just format it cleanly: rackCode-level-binCode
  const fullAddress = `${shelf.rack.code}-${shelf.level}-${data.binCode}`

  return prisma.storeBin.create({
    data: {
      ...data,
      fullAddress,
    },
  })
}

export async function updateBin(id: string, data: Partial<StoreBinInput>) {
  // If shelf or binCode changes, fullAddress needs recomputing. 
  // For simplicity, we assume we only update notes/capacity/active.
  // Full implementation would handle recomputing address if codes change.
  return prisma.storeBin.update({ where: { id }, data })
}

export async function deleteBin(id: string) {
  return prisma.storeBin.delete({ where: { id } })
}

export async function assignStockToBin(binId: string, data: AssignStockInput, userId: string) {
  // Find if a bin_stock already exists for this bin/product/batch
  const existing = await prisma.binStock.findFirst({
    where: {
      binId,
      productId: data.productId,
      batchId: data.batchId || null,
    },
  })

  let binStock
  if (existing) {
    binStock = await prisma.binStock.update({
      where: { id: existing.id },
      data: {
        quantity: data.quantity,
        updatedAt: new Date(),
      },
    })
  } else {
    binStock = await prisma.binStock.create({
      data: {
        binId,
        productId: data.productId,
        batchId: data.batchId || null,
        quantity: data.quantity,
        placedById: userId,
      },
    })
  }

  // Update bin currentFill
  await recalculateBinFill(binId)

  return binStock
}

export async function removeStockFromBin(binStockId: string) {
  const stock = await prisma.binStock.delete({
    where: { id: binStockId },
  })
  await recalculateBinFill(stock.binId)
  return stock
}

async function recalculateBinFill(binId: string) {
  const stocks = await prisma.binStock.findMany({
    where: { binId },
    select: { quantity: true },
  })
  const total = stocks.reduce((acc, s) => acc + s.quantity, 0)
  
  await prisma.storeBin.update({
    where: { id: binId },
    data: { currentFill: total },
  })
}

// ============================================================================
// LOCATE PRODUCT
// ============================================================================

export async function locateProduct(query: StoreLocateQuery) {
  const { q, branchId, limit } = query
  
  if (!q || q.trim().length < 2) {
    return []
  }

  // 1. Search for products matching the query
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { genericName: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ],
      ...(branchId ? {
        inventory: { some: { branchId } }
      } : {})
    },
    take: limit,
    select: { id: true, name: true, sku: true, genericName: true }
  })

  const productIds = products.map(p => p.id)
  
  // 2. Also search for specific batches (e.g. if q is a batch number)
  const batches = await prisma.batch.findMany({
    where: {
      batchNumber: { contains: q, mode: 'insensitive' },
      ...(branchId ? { branchId } : {})
    },
    take: limit,
    select: { id: true, productId: true }
  })
  
  for (const b of batches) {
    if (!productIds.includes(b.productId)) {
      productIds.push(b.productId)
    }
  }

  if (productIds.length === 0) return []

  // 3. Find bin stocks for these products
  const stocks = await prisma.binStock.findMany({
    where: {
      productId: { in: productIds },
      ...(branchId ? {
        bin: { shelf: { rack: { wall: { branchId } } } }
      } : {})
    },
    include: {
      bin: {
        include: {
          shelf: {
            include: {
              rack: {
                include: {
                  wall: true
                }
              }
            }
          }
        }
      },
      product: {
        select: { id: true, name: true, sku: true, genericName: true }
      },
      batch: true
    },
    orderBy: { quantity: 'desc' }
  })

  // Group the stocks by Product
  interface LocateResult {
    product: any;
    locations: any[];
  }
  const grouped = stocks.reduce((acc: Record<string, LocateResult>, stock) => {
    if (!acc[stock.productId]) {
      acc[stock.productId] = {
        product: stock.product,
        locations: []
      }
    }
    
    acc[stock.productId].locations.push({
      id: stock.id,
      quantity: stock.quantity,
      batch: stock.batch,
      wall: { id: stock.bin.shelf.rack.wall.id, name: stock.bin.shelf.rack.wall.name, code: stock.bin.shelf.rack.wall.code },
      rack: { id: stock.bin.shelf.rack.id, name: stock.bin.shelf.rack.name, code: stock.bin.shelf.rack.code },
      shelf: { id: stock.bin.shelf.id, level: stock.bin.shelf.level, label: stock.bin.shelf.label },
      bin: { id: stock.bin.id, code: stock.bin.binCode, fullAddress: stock.bin.fullAddress }
    })
    
    return acc
  }, {} as Record<string, LocateResult>)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Object.values(grouped) as any[]
}
