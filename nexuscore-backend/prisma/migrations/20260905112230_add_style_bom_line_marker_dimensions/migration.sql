-- Marker Length/Width/Weight for Style Card BOM Fabric rows — previously calculator-only
-- (used to compute Quantity but never persisted), so a saved value reset to 0 on reload.
ALTER TABLE "StyleBomLine" ADD COLUMN "marketLength" DECIMAL(10,4);
ALTER TABLE "StyleBomLine" ADD COLUMN "marketWidth" DECIMAL(10,4);
ALTER TABLE "StyleBomLine" ADD COLUMN "marketWeight" DECIMAL(10,4);
