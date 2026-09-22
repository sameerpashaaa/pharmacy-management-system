const fs = require('fs');
const path = './prisma/migrations/20260922211500_add_store_management/migration.sql';
let sql = fs.readFileSync(path, 'utf8');

// Replace the AlterTable for racks to allow null wallId initially and not drop branchId yet
sql = sql.replace(
  /ALTER TABLE "racks" DROP COLUMN "branchId",\r?\nDROP COLUMN "shelfNumber",\r?\nADD COLUMN     "capacity" INTEGER,\r?\nADD COLUMN     "createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,\r?\nADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,\r?\nADD COLUMN     "name" TEXT,\r?\nADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,\r?\nADD COLUMN     "updatedAt" TIMESTAMP\(3\) NOT NULL,\r?\nADD COLUMN     "wallId" TEXT NOT NULL;/g,
  `ALTER TABLE "racks" 
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "wallId" TEXT;`
);

// Add the data migration and column drops after walls table is created
sql = sql.replace(
  /CONSTRAINT "walls_pkey" PRIMARY KEY \("id"\)\r?\n\);/g,
  `CONSTRAINT "walls_pkey" PRIMARY KEY ("id")
);

-- Safe data migration: Create default walls for existing branches
INSERT INTO "walls" ("id", "branchId", "code", "name", "wallType", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'DEF', 'Default Wall', 'OPEN', 0, true, NOW(), NOW()
FROM "branches";

-- Link existing racks to the default wall of their branch
UPDATE "racks" SET "wallId" = "walls"."id"
FROM "walls" WHERE "walls"."branchId" = "racks"."branchId";

-- Clean up racks columns and make wallId NOT NULL
ALTER TABLE "racks" DROP COLUMN "branchId", DROP COLUMN "shelfNumber", ALTER COLUMN "wallId" SET NOT NULL;`
);

fs.writeFileSync(path, sql);
