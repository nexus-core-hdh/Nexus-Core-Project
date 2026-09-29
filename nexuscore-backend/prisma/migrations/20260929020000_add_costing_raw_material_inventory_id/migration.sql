-- Costing Raw Material Costs: bind each line to its Inventory item (IM_Item.RecId). Additive only —
-- a nullable column plus an index; existing rows keep their typed Inventory Code/Name with no id.
ALTER TABLE "CostingRawMaterialLine" ADD COLUMN IF NOT EXISTS "inventoryId" INTEGER;

CREATE INDEX IF NOT EXISTS "CostingRawMaterialLine_inventoryId_idx" ON "CostingRawMaterialLine"("inventoryId");
