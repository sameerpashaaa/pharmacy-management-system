-- AlterTable
ALTER TABLE "narcotic_register" ADD CONSTRAINT "narcotic_register_direction_check" CHECK (("quantityIn" > 0 AND "quantityOut" = 0) OR ("quantityIn" = 0 AND "quantityOut" > 0));

-- CreateIndex
CREATE UNIQUE INDEX "narcotic_register_referenceType_referenceId_productId_batch_key" ON "narcotic_register"("referenceType", "referenceId", "productId", "batchId");

-- CreateIndex
CREATE INDEX "narcotic_register_branchId_productId_entryDate_idx" ON "narcotic_register"("branchId", "productId", "entryDate");

-- Backfill balanceQuantity for existing rows
-- Calculates running balance per (branchId, productId) ordered by entryDate
WITH ordered AS (
  SELECT
    id,
    "branchId",
    "productId",
    "quantityIn",
    "quantityOut",
    LAG("balanceQuantity") OVER (PARTITION BY "branchId", "productId" ORDER BY "entryDate", id) as prev_balance
  FROM "narcotic_register"
),
corrected AS (
  SELECT
    id,
    CASE
      WHEN prev_balance IS NULL THEN GREATEST("quantityIn" - "quantityOut", 0)
      ELSE prev_balance + "quantityIn" - "quantityOut"
    END as correct_balance
  FROM ordered
)
UPDATE "narcotic_register"
SET "balanceQuantity" = corrected.correct_balance
FROM corrected
WHERE "narcotic_register".id = corrected.id;