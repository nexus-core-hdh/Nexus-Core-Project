-- CreateTable
CREATE TABLE "CostingSheet" (
    "id" TEXT NOT NULL,
    "costingNo" TEXT NOT NULL,
    "costingDate" TIMESTAMP(3),
    "styleId" TEXT,
    "styleCode" TEXT,
    "styleName" TEXT,
    "accountCode" TEXT,
    "accountName" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "pkrRate" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "foreignCurrency" TEXT,
    "foreignRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "quotedPriceForex" TEXT,
    "quotedPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orderQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shippingTerms" TEXT,
    "paymentTerms" TEXT,
    "overheadPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "wastePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "gSuppliesPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "excessProductionPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "profitPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "financialCostPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "commissionPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "commission3Pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingRawMaterialLine" (
    "id" TEXT NOT NULL,
    "costingSheetId" TEXT NOT NULL,
    "groupCode" TEXT,
    "groupName" TEXT,
    "inventoryCode" TEXT,
    "inventoryName" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wastePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "forex" TEXT,
    "unit" TEXT,
    "explanation" TEXT,
    "costDetail" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CostingRawMaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingLaborLine" (
    "id" TEXT NOT NULL,
    "costingSheetId" TEXT NOT NULL,
    "groupCode" TEXT,
    "groupName" TEXT,
    "explanation" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wastePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "forex" TEXT,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CostingLaborLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingOtherLine" (
    "id" TEXT NOT NULL,
    "costingSheetId" TEXT NOT NULL,
    "groupCode" TEXT,
    "groupName" TEXT,
    "explanation" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "forex" TEXT,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CostingOtherLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostingSheet_costingNo_key" ON "CostingSheet"("costingNo");

-- CreateIndex
CREATE INDEX "CostingSheet_branchId_idx" ON "CostingSheet"("branchId");

-- CreateIndex
CREATE INDEX "CostingRawMaterialLine_costingSheetId_idx" ON "CostingRawMaterialLine"("costingSheetId");

-- CreateIndex
CREATE INDEX "CostingLaborLine_costingSheetId_idx" ON "CostingLaborLine"("costingSheetId");

-- CreateIndex
CREATE INDEX "CostingOtherLine_costingSheetId_idx" ON "CostingOtherLine"("costingSheetId");

-- AddForeignKey
ALTER TABLE "CostingRawMaterialLine" ADD CONSTRAINT "CostingRawMaterialLine_costingSheetId_fkey" FOREIGN KEY ("costingSheetId") REFERENCES "CostingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingLaborLine" ADD CONSTRAINT "CostingLaborLine_costingSheetId_fkey" FOREIGN KEY ("costingSheetId") REFERENCES "CostingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingOtherLine" ADD CONSTRAINT "CostingOtherLine_costingSheetId_fkey" FOREIGN KEY ("costingSheetId") REFERENCES "CostingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
