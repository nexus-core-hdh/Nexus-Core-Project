-- Effective BOM: the Style Card values a Work Order's own BOM lines (MA_RecipeItem) were last
-- written against, one row per Work Order and BOM line type. Lets the Work Order BOM inherit later
-- Style Card changes for every value the Work Order did not explicitly override
-- (work-order.service.ts resolveEffectiveBom). Additive only; no existing table is changed.
CREATE TABLE IF NOT EXISTS "WorkOrderBomBaseline" (
    "id" TEXT NOT NULL,
    "workOrderId" BIGINT NOT NULL,
    "lineType" TEXT NOT NULL,
    "styleCardId" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderBomBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrderBomBaseline_workOrderId_lineType_key" ON "WorkOrderBomBaseline"("workOrderId", "lineType");
