-- Cutting Card / Cutting Entry feature. No legacy MA_Cutting* table exists anywhere in this
-- database (confirmed via information_schema before writing this migration) -- these are genuinely
-- new, Prisma-native tables, unlike most of the legacy-erp module's other work which reuses
-- pre-existing raw MA_* tables. See CuttingCard/CuttingCardSize's own schema.prisma comments for
-- why Order Qty / Will-Be-Cut Qty are deliberately NOT columns here (both stay fully derived from
-- existing sources on every read).
CREATE TABLE "CuttingCard" (
    "id" TEXT NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "productionColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "CuttingCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuttingCardSize" (
    "id" TEXT NOT NULL,
    "cuttingCardId" TEXT NOT NULL,
    "sizeCode" TEXT NOT NULL,
    "cutQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingCardSize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CuttingCard_workOrderId_idx" ON "CuttingCard"("workOrderId");

CREATE UNIQUE INDEX "CuttingCard_workOrderId_productionColor_key" ON "CuttingCard"("workOrderId", "productionColor");

CREATE UNIQUE INDEX "CuttingCardSize_cuttingCardId_sizeCode_key" ON "CuttingCardSize"("cuttingCardId", "sizeCode");

ALTER TABLE "CuttingCardSize" ADD CONSTRAINT "CuttingCardSize_cuttingCardId_fkey" FOREIGN KEY ("cuttingCardId") REFERENCES "CuttingCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
