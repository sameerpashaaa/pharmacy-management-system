-- CreateEnum
CREATE TYPE "AdjustmentApprovalTier" AS ENUM ('SELF', 'MANAGER', 'CHIEF');

-- AlterTable
ALTER TABLE "stock_adjustments" ADD COLUMN     "evidenceFileId" TEXT,
ADD COLUMN     "requiredTier" "AdjustmentApprovalTier";

-- CreateIndex
CREATE INDEX "stock_adjustments_evidenceFileId_idx" ON "stock_adjustments"("evidenceFileId");

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
