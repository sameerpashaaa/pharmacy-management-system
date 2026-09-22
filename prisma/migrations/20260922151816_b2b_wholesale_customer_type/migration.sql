-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'WHOLESALE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "customerType" "CustomerType" NOT NULL DEFAULT 'RETAIL';
