-- Create partial unique index for OPENING_BALANCE: one per branch+product
CREATE UNIQUE INDEX IF NOT EXISTS "narcotic_register_opening_balance_unique"
ON "narcotic_register" ("branchId", "productId")
WHERE "movementType" = 'OPENING_BALANCE';