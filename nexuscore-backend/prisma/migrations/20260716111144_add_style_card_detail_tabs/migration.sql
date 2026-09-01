-- AlterTable
ALTER TABLE "CostingSheet" ADD COLUMN     "secondForeignCurrency" TEXT,
ADD COLUMN     "secondForeignRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN     "styleCardId" TEXT;

-- AlterTable
ALTER TABLE "PlmOrder" ADD COLUMN     "customerOrderNo" TEXT,
ADD COLUMN     "orderDate" TIMESTAMP(3),
ADD COLUMN     "orderGroup" TEXT,
ADD COLUMN     "sampleTypeId" TEXT,
ADD COLUMN     "shipmentDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StyleCard" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "bomCmtPrice" DECIMAL(12,2),
ADD COLUMN     "bomEmbroideryRoute" TEXT,
ADD COLUMN     "bomRouteCode" TEXT,
ADD COLUMN     "bomRunningQuantity" DECIMAL(14,2),
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "colorways" JSONB,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerStyleNo" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "designerId" TEXT,
ADD COLUMN     "explanations" TEXT,
ADD COLUMN     "garmentDye" TEXT,
ADD COLUMN     "garmentWash" TEXT,
ADD COLUMN     "groupCode" TEXT,
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "masterSize" TEXT,
ADD COLUMN     "productMerchandiserId" TEXT,
ADD COLUMN     "productionMerchandiserId" TEXT,
ADD COLUMN     "sizes" JSONB;

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleBomLine" (
    "id" TEXT NOT NULL,
    "styleCardId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
    "fabricCode" TEXT,
    "fabricName" TEXT,
    "explanation" TEXT,
    "placement" TEXT,
    "process" TEXT,
    "variant" TEXT,
    "rowColumn" TEXT,
    "swatchCardId" TEXT,
    "willBeCut" BOOLEAN NOT NULL DEFAULT false,
    "mainFabric" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wastePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "dyeWastagePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "otherWastagePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "component" TEXT,
    "dia" TEXT,
    "gauge" TEXT,
    "finishWidth" TEXT,
    "finishRoute" TEXT,
    "revision" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StyleBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleWashCare" (
    "id" TEXT NOT NULL,
    "styleCardId" TEXT NOT NULL,
    "washing" TEXT,
    "bleaching" TEXT,
    "tumbleDrying" TEXT,
    "naturalDrying" TEXT,
    "ironing" TEXT,
    "chemicalCleaning" TEXT,
    "wetCleaning" TEXT,

    CONSTRAINT "StyleWashCare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleExpenseLine" (
    "id" TEXT NOT NULL,
    "styleCardId" TEXT NOT NULL,
    "expenseType" TEXT,
    "explanation" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "forex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StyleExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldValue_entity_entityId_idx" ON "CustomFieldValue"("entity", "entityId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_customFieldId_idx" ON "CustomFieldValue"("customFieldId");

-- CreateIndex
CREATE INDEX "StyleBomLine_styleCardId_idx" ON "StyleBomLine"("styleCardId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleWashCare_styleCardId_key" ON "StyleWashCare"("styleCardId");

-- CreateIndex
CREATE INDEX "StyleExpenseLine_styleCardId_idx" ON "StyleExpenseLine"("styleCardId");

-- CreateIndex
CREATE INDEX "CostingSheet_styleCardId_idx" ON "CostingSheet"("styleCardId");

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingSheet" ADD CONSTRAINT "CostingSheet_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "DepartmentCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_productionMerchandiserId_fkey" FOREIGN KEY ("productionMerchandiserId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_productMerchandiserId_fkey" FOREIGN KEY ("productMerchandiserId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleBomLine" ADD CONSTRAINT "StyleBomLine_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleBomLine" ADD CONSTRAINT "StyleBomLine_swatchCardId_fkey" FOREIGN KEY ("swatchCardId") REFERENCES "SwatchCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleWashCare" ADD CONSTRAINT "StyleWashCare_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleExpenseLine" ADD CONSTRAINT "StyleExpenseLine_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlmOrder" ADD CONSTRAINT "PlmOrder_sampleTypeId_fkey" FOREIGN KEY ("sampleTypeId") REFERENCES "StyleSampleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
