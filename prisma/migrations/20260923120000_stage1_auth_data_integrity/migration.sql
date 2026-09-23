-- Stage 1 — Auth & data integrity (audit-driven)
-- 1. Payment records gain a lifecycle: original amounts are never mutated on
--    sale cancellation; voids and refunds become first-class, auditable rows.
-- 2. Prescriptions record when they were dispensed (consumed by a sale).
-- 3. InventoryMovement learns QUARANTINE for returned goods held out of
--    sellable stock.

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('ACTIVE', 'VOIDED', 'REFUND');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'QUARANTINE';

-- AlterTable
ALTER TABLE "payments"
  ADD COLUMN "status" "PaymentRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN "dispensedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_supplierId_idx" ON "payments"("supplierId");
