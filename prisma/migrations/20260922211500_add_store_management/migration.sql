-- CreateEnum
CREATE TYPE "WallType" AS ENUM ('OPEN', 'REFRIGERATED', 'COLD_CHAIN', 'CONTROLLED_ACCESS');

-- DropForeignKey
ALTER TABLE "racks" DROP CONSTRAINT "racks_branchId_fkey";

-- DropIndex
DROP INDEX "racks_branchId_code_shelfNumber_key";

-- DropIndex
DROP INDEX "racks_branchId_idx";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "primaryBinId" TEXT;

-- AlterTable
ALTER TABLE "racks" DROP COLUMN "branchId",
DROP COLUMN "shelfNumber",
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "wallId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "walls" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wallType" "WallType" NOT NULL DEFAULT 'OPEN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_shelves" (
    "id" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "maxBins" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rack_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_bins" (
    "id" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "binCode" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "capacity" INTEGER,
    "currentFill" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bin_stocks" (
    "id" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "placedById" TEXT,

    CONSTRAINT "bin_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "walls_branchId_idx" ON "walls"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "walls_branchId_code_key" ON "walls"("branchId", "code");

-- CreateIndex
CREATE INDEX "rack_shelves_rackId_idx" ON "rack_shelves"("rackId");

-- CreateIndex
CREATE UNIQUE INDEX "rack_shelves_rackId_level_key" ON "rack_shelves"("rackId", "level");

-- CreateIndex
CREATE INDEX "store_bins_shelfId_idx" ON "store_bins"("shelfId");

-- CreateIndex
CREATE INDEX "store_bins_fullAddress_idx" ON "store_bins"("fullAddress");

-- CreateIndex
CREATE UNIQUE INDEX "store_bins_shelfId_binCode_key" ON "store_bins"("shelfId", "binCode");

-- CreateIndex
CREATE INDEX "bin_stocks_binId_idx" ON "bin_stocks"("binId");

-- CreateIndex
CREATE INDEX "bin_stocks_productId_idx" ON "bin_stocks"("productId");

-- CreateIndex
CREATE INDEX "bin_stocks_batchId_idx" ON "bin_stocks"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "bin_stocks_binId_productId_batchId_key" ON "bin_stocks"("binId", "productId", "batchId");

-- CreateIndex
CREATE INDEX "products_primaryBinId_idx" ON "products"("primaryBinId");

-- CreateIndex
CREATE INDEX "racks_wallId_idx" ON "racks"("wallId");

-- CreateIndex
CREATE UNIQUE INDEX "racks_wallId_code_key" ON "racks"("wallId", "code");

-- AddForeignKey
ALTER TABLE "walls" ADD CONSTRAINT "walls_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "walls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_shelves" ADD CONSTRAINT "rack_shelves_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_bins" ADD CONSTRAINT "store_bins_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "rack_shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bin_stocks" ADD CONSTRAINT "bin_stocks_binId_fkey" FOREIGN KEY ("binId") REFERENCES "store_bins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bin_stocks" ADD CONSTRAINT "bin_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bin_stocks" ADD CONSTRAINT "bin_stocks_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primaryBinId_fkey" FOREIGN KEY ("primaryBinId") REFERENCES "store_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

