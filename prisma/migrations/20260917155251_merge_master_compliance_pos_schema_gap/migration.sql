-- CreateEnum
CREATE TYPE "NarcoticMovementType" AS ENUM ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'SALES_DISPENSE', 'RETURN_TO_SUPPLIER', 'DESTRUCTION');

-- AlterEnum
ALTER TYPE "DrugSchedule" ADD VALUE 'NARCOTIC_NDPS';

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "dpcoCeiling" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "doctorId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "dpcoCeiling" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "mciNumber" TEXT,
    "specialization" TEXT,
    "clinicName" TEXT,
    "clinicAddress" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_h1_register" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientAddress" TEXT NOT NULL,
    "patientPhone" TEXT,
    "doctorName" TEXT NOT NULL,
    "doctorRegNo" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantityGiven" INTEGER NOT NULL,
    "dispensedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "schedule_h1_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narcotic_register" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "movementType" "NarcoticMovementType" NOT NULL,
    "quantityIn" INTEGER NOT NULL DEFAULT 0,
    "quantityOut" INTEGER NOT NULL DEFAULT 0,
    "balanceQuantity" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "patientName" TEXT,
    "doctorName" TEXT,
    "doctorRegNo" TEXT,
    "prescriptionNo" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT NOT NULL,

    CONSTRAINT "narcotic_register_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctors_registrationNo_key" ON "doctors"("registrationNo");

-- CreateIndex
CREATE INDEX "doctors_registrationNo_idx" ON "doctors"("registrationNo");

-- CreateIndex
CREATE INDEX "doctors_name_idx" ON "doctors"("name");

-- CreateIndex
CREATE INDEX "schedule_h1_register_dispensedDate_idx" ON "schedule_h1_register"("dispensedDate");

-- CreateIndex
CREATE INDEX "schedule_h1_register_doctorRegNo_idx" ON "schedule_h1_register"("doctorRegNo");

-- CreateIndex
CREATE INDEX "schedule_h1_register_patientPhone_idx" ON "schedule_h1_register"("patientPhone");

-- CreateIndex
CREATE INDEX "narcotic_register_branchId_entryDate_idx" ON "narcotic_register"("branchId", "entryDate");

-- CreateIndex
CREATE INDEX "narcotic_register_productId_idx" ON "narcotic_register"("productId");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_h1_register" ADD CONSTRAINT "schedule_h1_register_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_h1_register" ADD CONSTRAINT "schedule_h1_register_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_h1_register" ADD CONSTRAINT "schedule_h1_register_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_h1_register" ADD CONSTRAINT "schedule_h1_register_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_h1_register" ADD CONSTRAINT "schedule_h1_register_doctorRegNo_fkey" FOREIGN KEY ("doctorRegNo") REFERENCES "doctors"("registrationNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register" ADD CONSTRAINT "narcotic_register_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register" ADD CONSTRAINT "narcotic_register_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register" ADD CONSTRAINT "narcotic_register_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
