-- Cutting Card rebuild: scope each CuttingCard row to (Work Order, Production Color, Fabric)
-- instead of just (Work Order, Production Color) -- a Work Order with multiple applicable
-- Fabrics under the same color (e.g. "MAIN FAB" + "RIB") needs one independently-editable Cut
-- Qty set per Fabric, not one shared row. All existing rows at this point are this session's own
-- throwaway test/verification data (confirmed via a live query before writing this migration --
-- none belong to a real, currently-open Work Order with genuine saved Cut quantities), so this
-- clears them rather than attempting to backfill a materialKey for data that was never real.
DELETE FROM "CuttingCardSize";
DELETE FROM "CuttingCard";

DROP INDEX "CuttingCard_workOrderId_productionColor_key";
DROP INDEX "CuttingCard_workOrderId_idx";

ALTER TABLE "CuttingCard"
  ADD COLUMN "materialKey" TEXT NOT NULL,
  ADD COLUMN "materialLabel" TEXT NOT NULL;

CREATE UNIQUE INDEX "CuttingCard_workOrderId_productionColor_materialKey_key" ON "CuttingCard"("workOrderId", "productionColor", "materialKey");

CREATE INDEX "CuttingCard_workOrderId_productionColor_idx" ON "CuttingCard"("workOrderId", "productionColor");
