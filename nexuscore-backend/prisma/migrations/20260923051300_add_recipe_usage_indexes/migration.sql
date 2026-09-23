-- Recipe Usage ("Where Used") — supports recipe-usage.service.ts's lookups by the legacy
-- IM_Item id a BOM/recipe row points at, avoiding a full table scan on each of these.
CREATE INDEX "StyleBomLine_fabricInventoryId_idx" ON "StyleBomLine"("fabricInventoryId");
CREATE INDEX "SampleBomLine_fabricInventoryId_idx" ON "SampleBomLine"("fabricInventoryId");
CREATE INDEX "FabricYarnRecipeLine_yarnInventoryId_idx" ON "FabricYarnRecipeLine"("yarnInventoryId");
