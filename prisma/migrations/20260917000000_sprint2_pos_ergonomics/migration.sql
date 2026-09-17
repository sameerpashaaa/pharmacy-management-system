-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "ptr" DECIMAL(12,2),
ADD COLUMN     "pts" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "pts" DECIMAL(12,2),
ADD COLUMN     "rackId" TEXT;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "billedUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "looseUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalBaseQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "thermalSlipPrinted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "upiQrData" TEXT;

-- CreateTable
CREATE TABLE "racks" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shelfNumber" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "racks_branchId_idx" ON "racks"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "racks_branchId_code_shelfNumber_key" ON "racks"("branchId", "code", "shelfNumber");

-- CreateIndex
CREATE INDEX "products_drugSchedule_idx" ON "products"("drugSchedule");

-- CreateIndex
CREATE INDEX "products_rackId_idx" ON "products"("rackId");

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
