-- Stage 2 — H12 (GRN as a first-class entity), H14 (batch uniqueness scope).
--
-- Before this migration GRNs were piggy-backed on Purchase rows
-- (grnNumber = purchaseNumber) and a batch was globally unique per product,
-- which blocked legitimate re-receipts (the same physical batch arriving
-- under two different POs).

-- 1) Create the new GRN + GRN-line tables.
CREATE TABLE "goods_receipt_notes" (
  "id"          TEXT NOT NULL,
  "grnNumber"   TEXT NOT NULL,
  "purchaseId"  TEXT NOT NULL,
  "branchId"    TEXT NOT NULL,
  "grnDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"       TEXT,
  "totalAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipt_items" (
  "id"                 TEXT NOT NULL,
  "goodsReceiptId"     TEXT NOT NULL,
  "purchaseItemId"     TEXT NOT NULL,
  "batchId"            TEXT NOT NULL,
  "receivedQuantity"   INTEGER NOT NULL,
  "batchNumber"        TEXT NOT NULL,
  "expiryDate"         TIMESTAMP(3) NOT NULL,
  "manufacturingDate"  TIMESTAMP(3),
  "purchasePrice"      DECIMAL(12, 2) NOT NULL,
  "mrp"                DECIMAL(12, 2) NOT NULL,
  "coldChainTempLog"   TEXT,
  "qualityCheckPassed" BOOLEAN NOT NULL DEFAULT true,
  "qualityCheckNotes"  TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goods_receipt_notes_branchId_grnNumber_key"
  ON "goods_receipt_notes"("branchId", "grnNumber");
CREATE INDEX "goods_receipt_notes_purchaseId_idx" ON "goods_receipt_notes"("purchaseId");
CREATE INDEX "goods_receipt_notes_branchId_grnDate_idx"
  ON "goods_receipt_notes"("branchId", "grnDate");
CREATE INDEX "goods_receipt_items_goodsReceiptId_idx" ON "goods_receipt_items"("goodsReceiptId");
CREATE INDEX "goods_receipt_items_purchaseItemId_idx" ON "goods_receipt_items"("purchaseItemId");
CREATE INDEX "goods_receipt_items_batchId_idx" ON "goods_receipt_items"("batchId");

ALTER TABLE "goods_receipt_notes"
  ADD CONSTRAINT "goods_receipt_notes_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_notes"
  ADD CONSTRAINT "goods_receipt_notes_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_notes"
  ADD CONSTRAINT "goods_receipt_notes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_goodsReceiptId_fkey"
  FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_purchaseItemId_fkey"
  FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Backfill: every Purchase with receivedAt set gets a synthetic GRN row
-- referencing any batches tied to its purchaseItems. purchaseNumber is used
-- as the synthetic grnNumber so the old listGrns response shape keeps
-- working through the migration.
INSERT INTO "goods_receipt_notes"
  ("id", "grnNumber", "purchaseId", "branchId", "grnDate", "totalAmount",
   "createdById", "createdAt")
SELECT
  'grn_legacy_' || p.id,
  p."purchaseNumber",
  p.id,
  p."branchId",
  COALESCE(p."receivedAt", p."purchaseDate", p."createdAt"),
  p."totalAmount",
  p."createdById",
  p."createdAt"
FROM "purchases" p
WHERE p."receivedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "goods_receipt_notes" grn WHERE grn.id = 'grn_legacy_' || p.id
  );

INSERT INTO "goods_receipt_items"
  ("id", "goodsReceiptId", "purchaseItemId", "batchId", "receivedQuantity",
   "batchNumber", "expiryDate", "manufacturingDate", "purchasePrice", "mrp",
   "coldChainTempLog", "qualityCheckPassed", "qualityCheckNotes", "createdAt")
SELECT
  'gri_legacy_' || pi.id,
  'grn_legacy_' || pi."purchaseId",
  pi.id,
  b.id,
  pi."receivedQuantity",
  COALESCE(pi."batchNumber", b."batchNumber", 'LEGACY-' || pi.id),
  COALESCE(pi."expiryDate", b."expiryDate", CURRENT_TIMESTAMP + INTERVAL '365 days'),
  pi."manufacturingDate",
  pi."unitCost",
  pi."mrp",
  NULL,
  true,
  NULL,
  COALESCE(p."createdAt", CURRENT_TIMESTAMP)
FROM "purchase_items" pi
JOIN "purchases" p ON p.id = pi."purchaseId"
LEFT JOIN "batches" b
  ON b."productId" = pi."productId"
  AND b."batchNumber" = COALESCE(pi."batchNumber", b."batchNumber")
  AND b."purchaseId" = pi."purchaseId"
WHERE pi."receivedQuantity" > 0
  AND b.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "goods_receipt_items" gri WHERE gri.id = 'gri_legacy_' || pi.id
  );

-- 3) H14 — relax the batch uniqueness constraint so the same batchNumber can
-- legitimately arrive under two different POs. Scope to (product, batchNumber,
-- purchaseId): within one PO the conflict remains, but cross-PO re-receipts
-- are now allowed (each PO gets its own Batch row).
DROP INDEX "batches_productId_batchNumber_key";
CREATE UNIQUE INDEX "batches_productId_batchNumber_purchaseId_key"
  ON "batches"("productId", "batchNumber", "purchaseId");
