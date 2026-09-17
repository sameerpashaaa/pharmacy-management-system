-- Add referenceLineId column as nullable first
ALTER TABLE "gst_transactions" ADD COLUMN "referenceLineId" TEXT;

-- Backfill referenceLineId for existing SALE GST transactions
-- Match by referenceId (saleId) and line item position/HSN/taxableAmount
WITH sale_lines AS (
  SELECT
    si.id AS line_id,
    s.id AS sale_id,
    ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY si."createdAt") AS rn
  FROM "sale_items" si
  JOIN "sales" s ON si."saleId" = s.id
  WHERE s.status != 'CANCELLED'
),
gst_sale AS (
  SELECT
    gt.id AS gst_id,
    gt."referenceId" AS sale_id,
    gt."hsnCode",
    gt."taxableAmount",
    ROW_NUMBER() OVER (PARTITION BY gt."referenceId" ORDER BY gt."createdAt") AS rn
  FROM "gst_transactions" gt
  WHERE gt."referenceType" = 'SALE'
    AND gt."referenceLineId" IS NULL
)
UPDATE "gst_transactions" gt
SET "referenceLineId" = sl.line_id
FROM sale_lines sl
JOIN gst_sale gs ON gs.sale_id = sl.sale_id AND gs.rn = sl.rn
WHERE gt.id = gs.gst_id;

-- Backfill referenceLineId for existing PURCHASE GST transactions
WITH purchase_lines AS (
  SELECT
    pi.id AS line_id,
    p.id AS purchase_id,
    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pi."createdAt") AS rn
  FROM "purchase_items" pi
  JOIN "purchases" p ON pi."purchaseId" = p.id
  WHERE p.status != 'CANCELLED'
),
gst_purchase AS (
  SELECT
    gt.id AS gst_id,
    gt."referenceId" AS purchase_id,
    gt."hsnCode",
    gt."taxableAmount",
    ROW_NUMBER() OVER (PARTITION BY gt."referenceId" ORDER BY gt."createdAt") AS rn
  FROM "gst_transactions" gt
  WHERE gt."referenceType" = 'PURCHASE'
    AND gt."referenceLineId" IS NULL
)
UPDATE "gst_transactions" gt
SET "referenceLineId" = pl.line_id
FROM purchase_lines pl
JOIN gst_purchase gp ON gp.purchase_id = pl.purchase_id AND gp.rn = pl.rn
WHERE gt.id = gp.gst_id;

-- For any remaining NULL referenceLineId (orphaned GST transactions), set to a placeholder
-- These will be cleaned up by the unique constraint step
UPDATE "gst_transactions"
SET "referenceLineId" = 'migration-placeholder-' || id
WHERE "referenceLineId" IS NULL;

-- Create a temporary table to identify duplicates
CREATE TEMP TABLE gst_duplicates AS
SELECT "referenceType", "referenceId", "referenceLineId", MIN(id) as keep_id
FROM "gst_transactions"
GROUP BY "referenceType", "referenceId", "referenceLineId"
HAVING COUNT(*) > 1;

-- Delete duplicate rows (keep the first one)
DELETE FROM "gst_transactions" gt
USING gst_duplicates gd
WHERE gt."referenceType" = gd."referenceType"
  AND gt."referenceId" = gd."referenceId"
  AND gt."referenceLineId" = gd."referenceLineId"
  AND gt.id != gd.keep_id;

-- Drop temp table
DROP TABLE gst_duplicates;

-- Make referenceLineId NOT NULL
ALTER TABLE "gst_transactions" ALTER COLUMN "referenceLineId" SET NOT NULL;

-- Add unique constraint
ALTER TABLE "gst_transactions" ADD CONSTRAINT "gst_transactions_referenceType_referenceId_referenceLineId_key"
UNIQUE ("referenceType", "referenceId", "referenceLineId");