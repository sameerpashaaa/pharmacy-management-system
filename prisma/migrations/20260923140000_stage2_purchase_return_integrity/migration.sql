-- Stage 2 (H11) — Purchase-return integrity.
-- Track how many units of a PurchaseItem have already been returned so the
-- server can enforce the floor and prevent negative batch / inventory
-- values.
ALTER TABLE "purchase_items" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
