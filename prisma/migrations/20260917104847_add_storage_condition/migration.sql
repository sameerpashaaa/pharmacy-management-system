-- CreateEnum
CREATE TYPE "StorageCondition" AS ENUM ('DEEP_FREEZE', 'REFRIGERATED', 'COOL', 'ROOM_TEMPERATURE', 'CONTROLLED_ROOM_TEMP');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "storageCondition" "StorageCondition";
