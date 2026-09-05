-- Sample Card independent tab parity: new SampleCard-owned tables/columns mirroring the
-- equivalent StyleCard ones, plus relaxing PlmOrder/CostingSheet/StudyTemplateCard's existing
-- optional-tag pattern to also accept a Sample Card. No Style Card data is touched or linked.

-- AlterTable
ALTER TABLE "CostingSheet" ADD COLUMN     "sampleCardId" TEXT;

-- AlterTable
ALTER TABLE "PlmOrder" DROP CONSTRAINT "PlmOrder_styleCardId_fkey";
ALTER TABLE "PlmOrder" ADD COLUMN     "sampleCardId" TEXT,
ALTER COLUMN "styleCardId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SampleCard" ADD COLUMN     "explanations" TEXT,
ADD COLUMN     "measurementChartId" TEXT;

-- AlterTable
ALTER TABLE "StudyTemplateCard" ADD COLUMN     "sampleCardId" TEXT;

-- CreateTable
CREATE TABLE "SampleCardDetail" (
    "id" TEXT NOT NULL,
    "sampleCardId" TEXT NOT NULL,
    "designDetailTypeId" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "SampleCardDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleWashCare" (
    "id" TEXT NOT NULL,
    "sampleCardId" TEXT NOT NULL,
    "washing" TEXT,
    "bleaching" TEXT,
    "tumbleDrying" TEXT,
    "naturalDrying" TEXT,
    "ironing" TEXT,
    "chemicalCleaning" TEXT,
    "wetCleaning" TEXT,

    CONSTRAINT "SampleWashCare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleBomLine" (
    "id" TEXT NOT NULL,
    "sampleCardId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
    "fabricInventoryId" INTEGER,
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
    "unitId" INTEGER,
    "marketLength" DECIMAL(10,4),
    "marketWidth" DECIMAL(10,4),
    "marketWeight" DECIMAL(10,4),
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

    CONSTRAINT "SampleBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleWashCare_sampleCardId_key" ON "SampleWashCare"("sampleCardId");

-- CreateIndex
CREATE INDEX "SampleBomLine_sampleCardId_idx" ON "SampleBomLine"("sampleCardId");

-- CreateIndex
CREATE INDEX "CostingSheet_sampleCardId_idx" ON "CostingSheet"("sampleCardId");

-- AddForeignKey
ALTER TABLE "StudyTemplateCard" ADD CONSTRAINT "StudyTemplateCard_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingSheet" ADD CONSTRAINT "CostingSheet_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCardDetail" ADD CONSTRAINT "SampleCardDetail_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCardDetail" ADD CONSTRAINT "SampleCardDetail_designDetailTypeId_fkey" FOREIGN KEY ("designDetailTypeId") REFERENCES "DesignDetailType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleWashCare" ADD CONSTRAINT "SampleWashCare_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleBomLine" ADD CONSTRAINT "SampleBomLine_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleBomLine" ADD CONSTRAINT "SampleBomLine_swatchCardId_fkey" FOREIGN KEY ("swatchCardId") REFERENCES "SwatchCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_measurementChartId_fkey" FOREIGN KEY ("measurementChartId") REFERENCES "MeasurementChart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlmOrder" ADD CONSTRAINT "PlmOrder_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlmOrder" ADD CONSTRAINT "PlmOrder_sampleCardId_fkey" FOREIGN KEY ("sampleCardId") REFERENCES "SampleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
